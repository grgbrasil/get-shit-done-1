<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue';
import { useRoute } from 'vue-router';
import { api } from '../api';
import { useWebSocket } from '../composables/useWebSocket';
import FrontmatterForm from './FrontmatterForm.vue';

const route = useRoute();
const { on } = useWebSocket();

const projectId = computed(() => route.params.projectId as string);
const planId = computed(() => route.params.planId as string);
const phaseId = computed(() => route.params.phaseId as string);

const originalContent = ref('');
const frontmatter = ref<Record<string, unknown>>({});
const bodyContent = ref('');
const saving = ref(false);
const dirty = ref(false);
const diskChanged = ref(false);
const sourceMode = ref(true);
const filePath = ref('');

const hasFrontmatter = computed(() => Object.keys(frontmatter.value).length > 0);

function parseFrontmatter(raw: string): { fm: Record<string, unknown>; body: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { fm: {}, body: raw };

  try {
    const fm: Record<string, unknown> = {};
    const lines = match[1].split('\n');
    for (const line of lines) {
      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;
      const key = line.slice(0, colonIdx).trim();
      const val = line.slice(colonIdx + 1).trim();
      if (val.startsWith('[')) {
        fm[key] = val.slice(1, -1).split(',').map((s: string) => s.trim().replace(/"/g, ''));
      } else if (val === 'true' || val === 'false') {
        fm[key] = val === 'true';
      } else if (!isNaN(Number(val)) && val !== '') {
        fm[key] = Number(val);
      } else {
        fm[key] = val;
      }
    }
    return { fm, body: match[2] };
  } catch {
    return { fm: {}, body: raw };
  }
}

async function load() {
  if (!projectId.value || !planId.value || !phaseId.value) return;

  try {
    const phasesData = await api.phases.get(projectId.value, phaseId.value);
    const phaseDir = phasesData.phase;
    filePath.value = `phases/${phaseDir}/${planId.value}-PLAN.md`;

    const file = await api.files.read(projectId.value, filePath.value);
    originalContent.value = file.content;

    const parsed = parseFrontmatter(file.content);
    frontmatter.value = parsed.fm;
    bodyContent.value = parsed.body;
    dirty.value = false;
  } catch (err) {
    console.error('Failed to load file:', err);
  }
}

function onBodyChange(newBody: string) {
  bodyContent.value = newBody;
  dirty.value = true;
}

function serializeContent(): string {
  if (!hasFrontmatter.value) return bodyContent.value;

  const fmLines = ['---'];
  for (const [key, val] of Object.entries(frontmatter.value)) {
    if (Array.isArray(val)) {
      fmLines.push(`${key}: [${val.map((v: unknown) => `"${v}"`).join(', ')}]`);
    } else if (typeof val === 'boolean') {
      fmLines.push(`${key}: ${val}`);
    } else {
      fmLines.push(`${key}: ${val}`);
    }
  }
  fmLines.push('---');
  return fmLines.join('\n') + '\n' + bodyContent.value;
}

async function save() {
  if (!projectId.value || !filePath.value) return;
  saving.value = true;
  try {
    const newContent = serializeContent();
    await api.files.write(projectId.value, filePath.value, newContent);
    originalContent.value = newContent;
    dirty.value = false;
  } finally {
    saving.value = false;
  }
}

function reload() {
  diskChanged.value = false;
  load();
}

function onFrontmatterUpdate(key: string, value: unknown) {
  frontmatter.value = { ...frontmatter.value, [key]: value };
  dirty.value = true;
}

onMounted(() => {
  load();

  on('file:changed', (event) => {
    if (event.project === projectId.value && event.path === filePath.value) {
      if (dirty.value) {
        diskChanged.value = true;
      } else {
        load();
      }
    }
  });
});
watch([projectId, planId], load);
</script>

<template>
  <div class="editor-container">
    <div class="editor-toolbar">
      <h2>{{ planId }}-PLAN.md</h2>
      <div class="toolbar-actions">
        <span v-if="dirty" class="dirty-indicator">Unsaved changes</span>
        <button class="save-btn" @click="save" :disabled="!dirty || saving">
          {{ saving ? 'Saving...' : 'Save' }}
        </button>
      </div>
    </div>

    <div v-if="diskChanged" class="disk-banner">
      File changed on disk.
      <button @click="reload">Reload</button>
    </div>

    <FrontmatterForm
      v-if="hasFrontmatter"
      :frontmatter="frontmatter"
      @update="onFrontmatterUpdate"
    />

    <div class="editor-body">
      <textarea
        class="source-editor"
        :value="bodyContent"
        @input="onBodyChange(($event.target as HTMLTextAreaElement).value)"
      ></textarea>
    </div>
  </div>
</template>

<style scoped>
.editor-container { display: flex; flex-direction: column; height: 100%; }
.editor-toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
.editor-toolbar h2 { font-size: 1.1rem; }
.toolbar-actions { display: flex; align-items: center; gap: 0.75rem; }
.dirty-indicator { color: #d29922; font-size: 0.8rem; }
.save-btn {
  background: #238636; color: #fff; border: none; padding: 0.35rem 0.8rem;
  border-radius: 4px; cursor: pointer; font-size: 0.85rem;
}
.save-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.save-btn:hover:not(:disabled) { background: #2ea043; }
.disk-banner {
  background: #462c17; color: #d29922; padding: 0.5rem 1rem; border-radius: 4px;
  margin-bottom: 0.75rem; display: flex; align-items: center; gap: 0.75rem; font-size: 0.85rem;
}
.disk-banner button {
  background: #d29922; color: #0d1117; border: none; padding: 0.2rem 0.5rem;
  border-radius: 4px; cursor: pointer; font-size: 0.8rem;
}
.editor-body { flex: 1; }
.source-editor {
  width: 100%; height: 100%; min-height: 400px; background: #0d1117;
  border: 1px solid #30363d; color: #e1e4e8; padding: 1rem; border-radius: 8px;
  font-family: 'SF Mono', 'Fira Code', monospace; font-size: 0.85rem; line-height: 1.6; resize: vertical;
}
</style>
