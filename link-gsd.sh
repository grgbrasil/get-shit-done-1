#!/bin/bash
set -e

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
CLAUDE_DIR="$HOME/.claude"

GREEN='\033[32m'
YELLOW='\033[33m'
RED='\033[31m'
DIM='\033[2m'
RESET='\033[0m'

echo ""
echo -e "${GREEN}GSD Fork Linker${RESET}"
echo -e "${DIM}Substitui arquivos copiados por symlinks para o fork local${RESET}"
echo ""

# 1. get-shit-done/ (diretorio inteiro)
if [ -L "$CLAUDE_DIR/get-shit-done" ]; then
  echo -e "${DIM}get-shit-done/ ja e symlink, pulando${RESET}"
elif [ -d "$CLAUDE_DIR/get-shit-done" ]; then
  rm -rf "$CLAUDE_DIR/get-shit-done"
  echo -e "  ${YELLOW}removido${RESET} get-shit-done/ (copia)"
fi
ln -sf "$REPO_DIR/get-shit-done" "$CLAUDE_DIR/get-shit-done"
echo -e "  ${GREEN}linked${RESET} get-shit-done/"

# 2. commands/gsd/ (diretorio inteiro)
if [ -L "$CLAUDE_DIR/commands/gsd" ]; then
  echo -e "${DIM}commands/gsd/ ja e symlink, pulando${RESET}"
elif [ -d "$CLAUDE_DIR/commands/gsd" ]; then
  rm -rf "$CLAUDE_DIR/commands/gsd"
  echo -e "  ${YELLOW}removido${RESET} commands/gsd/ (copia)"
fi
ln -sf "$REPO_DIR/commands/gsd" "$CLAUDE_DIR/commands/gsd"
echo -e "  ${GREEN}linked${RESET} commands/gsd/"

# 3. agents/gsd-*.md (individuais — preserva agents nao-GSD)
AGENT_COUNT=0
for f in "$REPO_DIR"/agents/gsd-*.md; do
  [ -f "$f" ] || continue
  BASENAME=$(basename "$f")
  TARGET="$CLAUDE_DIR/agents/$BASENAME"
  rm -f "$TARGET"
  ln -sf "$f" "$TARGET"
  AGENT_COUNT=$((AGENT_COUNT + 1))
done
echo -e "  ${GREEN}linked${RESET} $AGENT_COUNT agents"

# 4. hooks/gsd-*.js (individuais — preserva hooks nao-GSD)
HOOK_COUNT=0
for f in "$REPO_DIR"/hooks/gsd-*.js; do
  [ -f "$f" ] || continue
  BASENAME=$(basename "$f")
  TARGET="$CLAUDE_DIR/hooks/$BASENAME"
  rm -f "$TARGET"
  ln -sf "$f" "$TARGET"
  HOOK_COUNT=$((HOOK_COUNT + 1))
done
echo -e "  ${GREEN}linked${RESET} $HOOK_COUNT hooks"

# Validacao
echo ""
echo -e "${DIM}Validando...${RESET}"
ERRORS=0

if [ ! -f "$CLAUDE_DIR/get-shit-done/VERSION" ]; then
  echo -e "  ${RED}ERRO${RESET}: get-shit-done/VERSION nao acessivel"
  ERRORS=$((ERRORS + 1))
else
  VERSION=$(cat "$CLAUDE_DIR/get-shit-done/VERSION")
  echo -e "  ${GREEN}OK${RESET} VERSION = $VERSION"
fi

if [ ! -d "$CLAUDE_DIR/commands/gsd" ]; then
  echo -e "  ${RED}ERRO${RESET}: commands/gsd/ nao acessivel"
  ERRORS=$((ERRORS + 1))
else
  CMD_COUNT=$(ls "$CLAUDE_DIR/commands/gsd/"*.md 2>/dev/null | wc -l | tr -d ' ')
  echo -e "  ${GREEN}OK${RESET} commands/gsd/ = $CMD_COUNT commands"
fi

if [ $ERRORS -eq 0 ]; then
  echo ""
  echo -e "${GREEN}Pronto. GSD agora roda a partir do fork local.${RESET}"
  echo -e "${DIM}Repo: $REPO_DIR${RESET}"
else
  echo ""
  echo -e "${RED}$ERRORS erros encontrados. Verifique os symlinks.${RESET}"
  exit 1
fi
