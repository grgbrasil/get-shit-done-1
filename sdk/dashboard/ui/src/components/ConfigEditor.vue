<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue';
import { useRoute } from 'vue-router';
import { api } from '../api';

const route = useRoute();
const projectId = computed(() => route.params.projectId as string);

const content = ref('');
const original = ref('');
const dirty = ref(false);
const saving = ref(false);
const error = ref('');

async function load() {
  if (!projectId.value) return;
  try {
    const file = await api.files.read(projectId.value, 'config.json');
    content.value = JSON.stringify(JSON.parse(file.content), null, 2);
    original.value = content.value;
    dirty.value = false;
    error.value = '';
  } catch (err) {
    error.value = (err as Error).message;
  }
}

function onChange(newValue: string) {
  content.value = newValue;
  dirty.value = newValue !== original.value;
  try {
    JSON.parse(newValue);
    error.value = '';
  } catch (e) {
    error.value = (e as Error).message;
  }
}

async function save() {
  if (!projectId.value || error.value) return;
  saving.value = true;
  try {
    await api.files.write(projectId.value, 'config.json', content.value);
    original.value = content.value;
    dirty.value = false;
  } finally {
    saving.value = false;
  }
}

onMounted(load);
watch(projectId, load);
</script>

<template>
  <div class="config-editor">
    <div class="editor-toolbar">
      <h2>config.json</h2>
      <div class="toolbar-actions">
        <span v-if="error" class="error-indicator">Invalid JSON</span>
        <span v-if="dirty && !error" class="dirty-indicator">Unsaved changes</span>
        <button class="save-btn" @click="save" :disabled="!dirty || saving || !!error">
          {{ saving ? 'Saving...' : 'Save' }}
        </button>
      </div>
    </div>
    <textarea
      class="json-editor"
      :value="content"
      @input="onChange(($event.target as HTMLTextAreaElement).value)"
      spellcheck="false"
    ></textarea>
  </div>
</template>

<style scoped>
.config-editor { display: flex; flex-direction: column; height: 100%; }
.editor-toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
.editor-toolbar h2 { font-size: 1.1rem; }
.toolbar-actions { display: flex; align-items: center; gap: 0.75rem; }
.error-indicator { color: #f85149; font-size: 0.8rem; }
.dirty-indicator { color: #d29922; font-size: 0.8rem; }
.save-btn {
  background: #238636; color: #fff; border: none; padding: 0.35rem 0.8rem;
  border-radius: 4px; cursor: pointer; font-size: 0.85rem;
}
.save-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.json-editor {
  flex: 1; min-height: 400px; background: #0d1117; border: 1px solid #30363d;
  color: #e1e4e8; padding: 1rem; border-radius: 8px;
  font-family: 'SF Mono', 'Fira Code', monospace; font-size: 0.85rem; line-height: 1.6; resize: vertical;
}
</style>
