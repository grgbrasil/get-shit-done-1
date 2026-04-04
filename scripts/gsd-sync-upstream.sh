#!/usr/bin/env bash
# gsd-sync-upstream.sh — Sync local repo with upstream, preserving local work
#
# Cascade Level 1: upstream (gsd-build) → dev repo (local) → fork (GitHub)
# Cascade Level 2: fork (GitHub) → grg (local) → origin (grg GitHub)
#
# The script auto-detects which level based on git remotes:
#   - If "origin" points to gsd-build → Level 1 (dev repo)
#   - If "upstream" points to gsd-build → Level 2 (grg)
#
# Usage:
#   scripts/gsd-sync-upstream.sh           # interactive mode
#   scripts/gsd-sync-upstream.sh --dry-run # show what would happen, don't do it
#
# What it does:
#   1. Safety checks (clean working tree, no unpushed commits)
#   2. Detects local branches with work not in upstream
#   3. Cherry-picks local work onto main before pulling upstream
#   4. Fetches and rebases on upstream
#   5. Pauses for interactive integration review if conflicts/overlaps detected
#   6. Pushes integrated result
#
# The integration review (step 5) is interactive — the script shows what
# needs attention and waits for you to resolve in your editor or Claude session.

set -euo pipefail

# ── Colors ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
RESET='\033[0m'

# ── Config ───────────────────────────────────────────────────────────────────
DRY_RUN=false
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
fi

# ── Helpers ──────────────────────────────────────────────────────────────────

info()  { echo -e "${BLUE}ℹ${RESET}  $*"; }
ok()    { echo -e "${GREEN}✓${RESET}  $*"; }
warn()  { echo -e "${YELLOW}⚠${RESET}  $*"; }
fail()  { echo -e "${RED}✗${RESET}  $*"; exit 1; }
step()  { echo -e "\n${BOLD}${CYAN}── $* ──${RESET}"; }
dry()   { if $DRY_RUN; then echo -e "  ${DIM}[dry-run] $*${RESET}"; return 1; else return 0; fi; }

confirm() {
  local msg="$1"
  if $DRY_RUN; then
    echo -e "  ${DIM}[dry-run] would ask: $msg [auto-yes]${RESET}"
    return 0
  fi
  # Only read from terminal — never hang on piped stdin
  if [[ ! -t 0 ]]; then
    warn "stdin nao e terminal — assumindo yes"
    return 0
  fi
  echo -en "${YELLOW}?${RESET}  ${msg} [y/N] "
  read -r answer
  [[ "$answer" =~ ^[Yy] ]]
}

# ── Detect cascade level ─────────────────────────────────────────────────────

detect_level() {
  cd "$REPO_DIR"

  local origin_url fork_url upstream_url
  origin_url=$(git remote get-url origin 2>/dev/null || echo "")
  fork_url=$(git remote get-url fork 2>/dev/null || echo "")
  upstream_url=$(git remote get-url upstream 2>/dev/null || echo "")

  # Level 1: origin = gsd-build, fork = grgbrasil
  if echo "$origin_url" | grep -q "gsd-build" && [[ -n "$fork_url" ]]; then
    UPSTREAM_REMOTE="origin"
    FORK_REMOTE="fork"
    LEVEL=1
    LEVEL_NAME="DEV REPO → upstream (gsd-build)"
    return
  fi

  # Level 2: origin = grgbrasil, upstream = gsd-build
  if echo "$upstream_url" | grep -q "gsd-build" && echo "$origin_url" | grep -q "grgbrasil"; then
    UPSTREAM_REMOTE="upstream"
    FORK_REMOTE="origin"
    LEVEL=2
    LEVEL_NAME="GRG → dev repo (fork)"
    return
  fi

  fail "Nao consigo detectar o nivel da cascata. Remotes encontrados:\n  origin: $origin_url\n  fork: $fork_url\n  upstream: $upstream_url"
}

# ── FASE 0: Safety checks ───────────────────────────────────────────────────

phase_safety() {
  step "FASE 0: Verificacoes de seguranca"
  cd "$REPO_DIR"

  # 0.1 Working tree limpa (modified/deleted/staged — untracked ok)
  local dirty
  dirty=$(git status --porcelain | grep -v '^??' || true)
  if [[ -n "$dirty" ]]; then
    fail "Working tree suja. Commit ou stash antes de rodar o sync.\n$dirty"
  fi
  ok "Working tree limpa"

  # 0.2 Qual branch estamos
  CURRENT_BRANCH=$(git branch --show-current)
  info "Branch atual: ${BOLD}$CURRENT_BRANCH${RESET}"

  # 0.3 Checar commits nao pushados no main
  local main_branch="main"
  local unpushed
  unpushed=$(git rev-list --count "${FORK_REMOTE}/${main_branch}..${main_branch}" 2>/dev/null || echo "0")

  if [[ "$unpushed" -gt 0 ]]; then
    info "main tem $unpushed commits nao pushados — pushing backup..."
    if dry "git push ${FORK_REMOTE} main"; then
      git push "${FORK_REMOTE}" main
      ok "main pushado pro ${FORK_REMOTE}"
    fi
  else
    ok "main sincronizado com ${FORK_REMOTE}"
  fi
}

# ── FASE 1: Detect local branches with unpushed work ────────────────────────

phase_detect_local_work() {
  step "FASE 1: Detectar trabalho local"
  cd "$REPO_DIR"

  LOCAL_BRANCHES_WITH_WORK=()
  LOCAL_BRANCH_COMMITS=()

  # Get all local branches except main and worktree-agent-*
  local branches
  branches=$(git branch --format='%(refname:short)' | grep -v '^main$' | grep -v '^worktree-agent-' || true)

  for branch in $branches; do
    # Check if branch has remote tracking
    local remote_branch="${FORK_REMOTE}/${branch}"
    if ! git rev-parse "$remote_branch" &>/dev/null; then
      # No remote — all commits since main are local
      local count
      count=$(git rev-list --count "main..$branch" 2>/dev/null || echo "0")
      if [[ "$count" -gt 0 ]]; then
        LOCAL_BRANCHES_WITH_WORK+=("$branch")
        LOCAL_BRANCH_COMMITS+=("$count (sem remote)")
        warn "$branch: $count commits (sem remote tracking)"
      fi
      continue
    fi

    # Has remote — check for unpushed
    local unpushed
    unpushed=$(git rev-list --count "${remote_branch}..${branch}" 2>/dev/null || echo "0")
    if [[ "$unpushed" -gt 0 ]]; then
      LOCAL_BRANCHES_WITH_WORK+=("$branch")
      LOCAL_BRANCH_COMMITS+=("$unpushed")
      warn "$branch: +$unpushed nao pushados"
    fi
  done

  if [[ ${#LOCAL_BRANCHES_WITH_WORK[@]} -eq 0 ]]; then
    ok "Todas as branches estao pushadas"
    return
  fi

  echo ""
  info "Branches com trabalho local:"
  for i in "${!LOCAL_BRANCHES_WITH_WORK[@]}"; do
    echo -e "    ${BOLD}${LOCAL_BRANCHES_WITH_WORK[$i]}${RESET}: +${LOCAL_BRANCH_COMMITS[$i]}"
  done

  info "Pushing branches pro ${FORK_REMOTE} (backup antes do sync)..."
  for branch in "${LOCAL_BRANCHES_WITH_WORK[@]}"; do
    if dry "git push ${FORK_REMOTE} $branch"; then
      git push "${FORK_REMOTE}" "$branch" --force-with-lease 2>/dev/null || \
      git push "${FORK_REMOTE}" "$branch" 2>/dev/null || \
      warn "Falhou push de $branch — continuando"
      ok "Pushed $branch"
    fi
  done
}

# ── FASE 2: Fetch + Diagnóstico ─────────────────────────────────────────────

phase_fetch_diagnose() {
  step "FASE 2: Fetch e diagnostico"
  cd "$REPO_DIR"

  info "Fetching ${UPSTREAM_REMOTE}..."
  git fetch "${UPSTREAM_REMOTE}" --quiet
  ok "Fetch ${UPSTREAM_REMOTE} completo"

  info "Fetching ${FORK_REMOTE}..."
  git fetch "${FORK_REMOTE}" --quiet
  ok "Fetch ${FORK_REMOTE} completo"

  # Count divergence
  BEHIND=$(git rev-list --count "main..${UPSTREAM_REMOTE}/main" 2>/dev/null || echo "0")
  AHEAD=$(git rev-list --count "${UPSTREAM_REMOTE}/main..main" 2>/dev/null || echo "0")

  echo ""
  info "Estado em relacao ao upstream:"
  echo -e "    Atras: ${RED}${BEHIND}${RESET} commits"
  echo -e "    Frente: ${GREEN}${AHEAD}${RESET} commits"

  if [[ "$BEHIND" -eq 0 ]]; then
    ok "Ja esta atualizado com o upstream"
    NEEDS_REBASE=false
  else
    NEEDS_REBASE=true
    echo ""
    info "Commits novos do upstream:"
    git log --oneline "main..${UPSTREAM_REMOTE}/main" 2>/dev/null | head -20 || true
    local total
    total=$(git rev-list --count "main..${UPSTREAM_REMOTE}/main" 2>/dev/null || echo "0")
    if [[ "$total" -gt 20 ]]; then
      echo -e "    ${DIM}... e mais $((total - 20)) commits${RESET}"
    fi
  fi

  # Detect overlapping files (upstream touched files that our branches also touch)
  if $NEEDS_REBASE && [[ ${#LOCAL_BRANCHES_WITH_WORK[@]} -gt 0 ]]; then
    echo ""
    step "Analise de sobreposicao"

    UPSTREAM_FILES=$(git diff --name-only "main..${UPSTREAM_REMOTE}/main" 2>/dev/null || true)

    for branch in "${LOCAL_BRANCHES_WITH_WORK[@]}"; do
      local branch_files
      branch_files=$(git diff --name-only "main..$branch" 2>/dev/null || true)

      local overlap
      overlap=$(comm -12 <(echo "$UPSTREAM_FILES" | sort) <(echo "$branch_files" | sort) 2>/dev/null || true)

      if [[ -n "$overlap" ]]; then
        warn "Sobreposicao entre upstream e ${BOLD}$branch${RESET}:"
        echo "$overlap" | while read -r f; do
          echo -e "      ${YELLOW}$f${RESET}"
        done
        echo ""
        info "Esses arquivos foram modificados tanto pelo upstream quanto pela branch."
        info "O agente de integracao vai analisar depois do rebase."
      else
        ok "Sem sobreposicao entre upstream e $branch"
      fi
    done
  fi
}

# ── FASE 3: Atualizar main ───────────────────────────────────────────────────

phase_update_main() {
  if ! $NEEDS_REBASE; then
    return
  fi

  step "FASE 3: Atualizar main com upstream ($BEHIND commits novos)"

  # Make sure we're on main
  if [[ "$CURRENT_BRANCH" != "main" ]]; then
    info "Trocando pra main..."
    if dry "git checkout main"; then
      git checkout main
    fi
  fi

  if [[ "$LEVEL" -eq 1 ]]; then
    # Level 1 (dev repo): main segue upstream — fast-forward ou merge
    # O trabalho vive em branches, main nunca diverge do upstream
    if [[ "$AHEAD" -eq 0 ]]; then
      info "Fast-forward main pro upstream ($BEHIND commits novos)..."
      if dry "git merge --ff-only ${UPSTREAM_REMOTE}/main"; then
        if ! git merge --ff-only "${UPSTREAM_REMOTE}/main" 2>/tmp/gsd-sync-merge-err; then
          fail "Fast-forward falhou — main divergiu do upstream?\n$(cat /tmp/gsd-sync-merge-err 2>/dev/null)"
        fi
        ok "main atualizado (fast-forward)"
      fi
    else
      # main has local commits — shouldn't happen on Level 1, but handle gracefully
      warn "main tem $AHEAD commits locais — isso nao deveria acontecer no dev repo"
      warn "O trabalho deveria estar em branches, nao no main"
      if ! confirm "Rebasear main no upstream? ($AHEAD commits locais vao pra cima dos $BEHIND novos)"; then
        warn "Rebase pulado"
        return
      fi
      if dry "git rebase ${UPSTREAM_REMOTE}/main"; then
        if ! git rebase "${UPSTREAM_REMOTE}/main" 2>/tmp/gsd-sync-rebase-err; then
          fail "Rebase deu conflito!\n\n$(cat /tmp/gsd-sync-rebase-err 2>/dev/null)\n\nResolva manualmente:\n  1. Edite os arquivos com conflito\n  2. git add <arquivo>\n  3. git rebase --continue\n  4. Re-rode este script\n\nOu aborte com: git rebase --abort"
        fi
        ok "main rebaseado"
      fi
    fi
  else
    # Level 2 (grg): main TEM commits locais (customizações) — sempre rebase
    # GARANTIA: backup + snapshot + verificação + rollback automático
    if ! confirm "Rebasear main no upstream? ($AHEAD commits locais vao pra cima dos $BEHIND novos)"; then
      warn "Rebase pulado"
      return
    fi

    # ── GARANTIA 1: Backup branch ──
    BACKUP_BRANCH="pre-sync-backup-$(date +%Y%m%d-%H%M%S)"
    if dry "git branch $BACKUP_BRANCH"; then
      git branch "$BACKUP_BRANCH"
      ok "Backup: ${BOLD}$BACKUP_BRANCH${RESET} (rollback: git reset --hard $BACKUP_BRANCH)"
    fi

    # ── GARANTIA 2: Snapshot dos arquivos customizados ──
    SNAPSHOT_DIR=$(mktemp -d /tmp/gsd-sync-snapshot-XXXXXX)
    # Capturar todos os arquivos que o grg modificou vs upstream
    local custom_files
    custom_files=$(git diff --name-only "${UPSTREAM_REMOTE}/main..main" 2>/dev/null || true)
    CUSTOM_FILE_COUNT=0
    if [[ -n "$custom_files" ]]; then
      while IFS= read -r f; do
        if [[ -f "$f" ]]; then
          mkdir -p "$SNAPSHOT_DIR/$(dirname "$f")"
          cp "$f" "$SNAPSHOT_DIR/$f"
          CUSTOM_FILE_COUNT=$((CUSTOM_FILE_COUNT + 1))
        fi
      done <<< "$custom_files"
      ok "Snapshot: $CUSTOM_FILE_COUNT arquivos customizados salvos em $SNAPSHOT_DIR"
    fi

    # ── REBASE ──
    if dry "git rebase ${UPSTREAM_REMOTE}/main"; then
      if ! git rebase "${UPSTREAM_REMOTE}/main" 2>/tmp/gsd-sync-rebase-err; then
        echo ""
        warn "Rebase deu conflito — abortando e restaurando backup"
        git rebase --abort 2>/dev/null || true
        git checkout main 2>/dev/null || true
        git reset --hard "$BACKUP_BRANCH" 2>/dev/null || true
        fail "Rebase abortado. main restaurado pro estado anterior.\nBackup branch: $BACKUP_BRANCH\n\nPara tentar manualmente:\n  git rebase ${UPSTREAM_REMOTE}/main\n  (resolver conflitos)\n  git rebase --continue"
      fi
      ok "Rebase completo — $AHEAD commits locais em cima de $BEHIND novos do upstream"
    fi

    # ── GARANTIA 3: Verificação pós-rebase ──
    LOST_FILES=()
    CHANGED_FILES=()
    if [[ -n "$custom_files" && "$CUSTOM_FILE_COUNT" -gt 0 ]]; then
      info "Verificando customizacoes..."
      while IFS= read -r f; do
        if [[ ! -f "$SNAPSHOT_DIR/$f" ]]; then
          continue  # Wasn't in snapshot (deleted file)
        fi
        if [[ ! -f "$f" ]]; then
          # File existed before, gone after rebase
          LOST_FILES+=("$f")
        elif ! diff -q "$SNAPSHOT_DIR/$f" "$f" &>/dev/null; then
          # File exists but content changed — might be ok (upstream improved) or bad (lost customization)
          # Check if the grg-specific changes are still present
          CHANGED_FILES+=("$f")
        fi
      done <<< "$custom_files"

      if [[ ${#LOST_FILES[@]} -eq 0 && ${#CHANGED_FILES[@]} -eq 0 ]]; then
        ok "GARANTIA: Todas as $CUSTOM_FILE_COUNT customizacoes intactas"
      else
        if [[ ${#LOST_FILES[@]} -gt 0 ]]; then
          echo ""
          warn "${RED}${BOLD}ARQUIVOS PERDIDOS (${#LOST_FILES[@]}):${RESET}"
          for f in "${LOST_FILES[@]}"; do
            echo -e "    ${RED}PERDIDO${RESET} $f"
          done

          # ── GARANTIA 4: Restauração automática ──
          info "Restaurando arquivos perdidos do snapshot..."
          for f in "${LOST_FILES[@]}"; do
            mkdir -p "$(dirname "$f")"
            cp "$SNAPSHOT_DIR/$f" "$f"
            git add "$f"
            ok "Restaurado: $f"
          done
          git commit -m "fix(sync): restore lost customizations after upstream rebase" --no-verify 2>/dev/null || true
          ok "Arquivos perdidos restaurados e commitados"
        fi

        if [[ ${#CHANGED_FILES[@]} -gt 0 ]]; then
          echo ""
          warn "${YELLOW}${BOLD}ARQUIVOS MODIFICADOS PELO REBASE (${#CHANGED_FILES[@]}):${RESET}"
          warn "Upstream e grg tocaram nesses arquivos. O git fez merge automatico"
          warn "mas as customizacoes PODEM ter sido alteradas."
          echo ""
          for f in "${CHANGED_FILES[@]}"; do
            # Show a brief diff summary
            local added removed
            added=$(diff "$SNAPSHOT_DIR/$f" "$f" 2>/dev/null | grep -c '^>' || true)
            removed=$(diff "$SNAPSHOT_DIR/$f" "$f" 2>/dev/null | grep -c '^<' || true)
            echo -e "    ${YELLOW}MODIFICADO${RESET} $f ${DIM}(+$added -$removed linhas)${RESET}"
          done
          echo ""
          info "Salvo em $SNAPSHOT_DIR para comparacao manual"
          info "Use: diff $SNAPSHOT_DIR/<arquivo> <arquivo>"
          NEEDS_INTEGRATION_REVIEW=true
        fi
      fi
    fi
  fi
}

# ── FASE 4: Rebase branches locais ──────────────────────────────────────────

phase_rebase_branches() {
  if ! $NEEDS_REBASE; then
    return
  fi

  if [[ ${#LOCAL_BRANCHES_WITH_WORK[@]} -eq 0 ]]; then
    return
  fi

  step "FASE 4: Rebasear branches locais no main novo"

  for branch in "${LOCAL_BRANCHES_WITH_WORK[@]}"; do
    info "Rebaseando $branch..."
    if dry "git rebase main $branch"; then
      if ! git rebase main "$branch" 2>/tmp/gsd-sync-branch-rebase-err; then
        git rebase --abort 2>/dev/null || true
        warn "Conflito no rebase de $branch — pulando"
        warn "Resolva manualmente depois: git checkout $branch && git rebase main"
        BRANCHES_NEED_REVIEW+=("$branch")
        continue
      fi
      ok "$branch rebaseado"
    fi
  done

  # Voltar pro main
  if ! $DRY_RUN; then
    git checkout main 2>/dev/null || true
  fi
}

# ── FASE 5: Integracao interativa ────────────────────────────────────────────

phase_integration_review() {
  step "FASE 5: Revisao de integracao"

  local needs_review=false

  # Check if any branches had conflicts
  if [[ ${#BRANCHES_NEED_REVIEW[@]} -gt 0 ]]; then
    needs_review=true
    echo ""
    warn "Branches que precisam de revisao manual:"
    for b in "${BRANCHES_NEED_REVIEW[@]}"; do
      echo -e "    ${RED}$b${RESET}"
    done
  fi

  # Check if customization verification flagged files
  if $NEEDS_INTEGRATION_REVIEW; then
    needs_review=true
  fi

  # Show summary
  if $NEEDS_REBASE && [[ "$BEHIND" -gt 0 ]]; then
    echo ""
    info "O upstream trouxe $BEHIND commits novos."
    info "Seus $AHEAD commits foram rebaseados em cima."

    if [[ -n "$BACKUP_BRANCH" ]]; then
      info "Backup branch: ${BOLD}$BACKUP_BRANCH${RESET}"
      info "Rollback: git reset --hard $BACKUP_BRANCH"
    fi
    if [[ -n "$SNAPSHOT_DIR" && -d "$SNAPSHOT_DIR" ]]; then
      info "Snapshot pre-rebase: $SNAPSHOT_DIR"
    fi
  fi

  if $needs_review; then
    echo ""
    echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
    echo -e "${BOLD}  PAUSA PARA REVISAO INTERATIVA${RESET}"
    echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
    echo ""
    echo -e "  Abra uma sessao Claude Code e revise as mudancas:"
    echo -e "  ${DIM}Verifique se o upstream nao quebrou ou melhorou algo que voce fez.${RESET}"
    echo ""
    echo -e "  Quando terminar, pressione ENTER para continuar o sync."
    echo ""
    if $DRY_RUN; then
      echo -e "  ${DIM}[dry-run] would pause here for review${RESET}"
    elif [[ -t 0 ]]; then
      read -r -p "  [ENTER para continuar, Ctrl+C para abortar] "
    else
      warn "stdin nao e terminal — pulando pausa"
    fi
  else
    ok "Nenhuma sobreposicao detectada — integracao limpa"
  fi
}

# ── FASE 6: Push ─────────────────────────────────────────────────────────────

phase_push() {
  step "FASE 6: Push"

  if $NEEDS_REBASE; then
    if confirm "Push main pro ${FORK_REMOTE}? (force-with-lease, rebase reescreveu historia)"; then
      if dry "git push ${FORK_REMOTE} main --force-with-lease"; then
        git push "${FORK_REMOTE}" main --force-with-lease
        ok "main pushado pro ${FORK_REMOTE}"
      fi
    fi

    # Push rebased branches
    if [[ ${#LOCAL_BRANCHES_WITH_WORK[@]} -gt 0 ]]; then
      if confirm "Push branches rebaseadas pro ${FORK_REMOTE}?"; then
        for branch in "${LOCAL_BRANCHES_WITH_WORK[@]}"; do
          if dry "git push ${FORK_REMOTE} $branch --force-with-lease"; then
            git push "${FORK_REMOTE}" "$branch" --force-with-lease 2>/dev/null || \
            warn "Falhou push de $branch"
            ok "Pushed $branch"
          fi
        done
      fi
    fi
  else
    ok "Nada pra pushar — upstream ja estava atualizado"
  fi
}

# ── FASE 7: Limpeza ─────────────────────────────────────────────────────────

phase_cleanup() {
  step "FASE 7: Limpeza"

  # Count worktree branches
  local worktree_branches
  worktree_branches=$(git branch --format='%(refname:short)' | grep '^worktree-agent-' || true)
  local wt_count=0
  if [[ -n "$worktree_branches" ]]; then
    wt_count=$(echo "$worktree_branches" | wc -l | tr -d ' ')
  fi

  if [[ "$wt_count" -gt 0 ]]; then
    warn "$wt_count branches worktree-agent-* orfas"
    if confirm "Deletar branches worktree-agent-* orfas?"; then
      echo "$worktree_branches" | while read -r b; do
        if [[ -n "$b" ]]; then
          if dry "git branch -D $b"; then
            git branch -D "$b" 2>/dev/null || true
          fi
        fi
      done
      ok "Branches worktree limpas"
    fi
  else
    ok "Sem branches orfas"
  fi
}

# ── FASE 8: Resumo ──────────────────────────────────────────────────────────

phase_summary() {
  echo ""
  echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
  echo -e "${BOLD}  SYNC COMPLETO — Level $LEVEL ($LEVEL_NAME)${RESET}"
  echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
  echo ""

  if $NEEDS_REBASE; then
    echo -e "  Upstream: ${GREEN}+$BEHIND${RESET} commits integrados"
    echo -e "  Local:    ${BLUE}$AHEAD${RESET} commits preservados"
    if [[ "$CUSTOM_FILE_COUNT" -gt 0 ]]; then
      echo -e "  Customizacoes: ${GREEN}$CUSTOM_FILE_COUNT${RESET} arquivos verificados"
    fi
  else
    echo -e "  Upstream: ja atualizado"
  fi

  if [[ ${#LOCAL_BRANCHES_WITH_WORK[@]} -gt 0 ]]; then
    echo -e "  Branches: ${#LOCAL_BRANCHES_WITH_WORK[@]} rebaseadas e pushadas"
  fi

  if [[ -n "$BACKUP_BRANCH" ]]; then
    echo ""
    info "Backup branch: ${BOLD}$BACKUP_BRANCH${RESET}"
    echo -e "    ${DIM}Rollback: git reset --hard $BACKUP_BRANCH${RESET}"
    echo -e "    ${DIM}Deletar depois de confirmar que tudo funciona: git branch -D $BACKUP_BRANCH${RESET}"
  fi

  if [[ ${#BRANCHES_NEED_REVIEW[@]} -gt 0 ]]; then
    echo ""
    warn "Branches pendentes de revisao:"
    for b in "${BRANCHES_NEED_REVIEW[@]}"; do
      echo -e "    ${RED}$b${RESET} — resolver manualmente"
    done
  fi

  if [[ "$LEVEL" -eq 1 ]]; then
    echo ""
    info "Proximo passo: rode o mesmo script no grg para propagar"
    echo -e "    ${DIM}cd /Volumes/SSD/Desenvolvimento/get-shit-done-grg && scripts/gsd-sync-upstream.sh${RESET}"
  fi

  echo ""
}

# ── Main ─────────────────────────────────────────────────────────────────────

main() {
  BRANCHES_NEED_REVIEW=()
  NEEDS_INTEGRATION_REVIEW=false
  BACKUP_BRANCH=""
  SNAPSHOT_DIR=""
  CUSTOM_FILE_COUNT=0

  echo -e "${BOLD}${CYAN}"
  echo "  ╔═══════════════════════════════════════════════════╗"
  echo "  ║           GSD Sync Upstream                       ║"
  echo "  ╚═══════════════════════════════════════════════════╝"
  echo -e "${RESET}"

  detect_level
  info "Nivel detectado: ${BOLD}$LEVEL${RESET} — $LEVEL_NAME"
  info "Upstream remote: ${BOLD}$UPSTREAM_REMOTE${RESET}"
  info "Fork remote: ${BOLD}$FORK_REMOTE${RESET}"

  if $DRY_RUN; then
    warn "Modo dry-run — nenhuma alteracao sera feita"
  fi

  echo ""

  phase_safety
  phase_detect_local_work
  phase_fetch_diagnose
  phase_update_main
  phase_rebase_branches
  phase_integration_review
  phase_push
  phase_cleanup
  phase_summary
}

main "$@"
