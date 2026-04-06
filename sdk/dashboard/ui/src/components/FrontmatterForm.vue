<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  frontmatter: Record<string, unknown>;
}>();

const emit = defineEmits<{
  update: [key: string, value: unknown];
}>();

const fields = computed(() => {
  const fm = props.frontmatter;
  return [
    { key: 'phase', label: 'Phase', value: fm.phase, type: 'text' },
    { key: 'plan', label: 'Plan', value: fm.plan, type: 'text' },
    { key: 'wave', label: 'Wave', value: fm.wave, type: 'number' },
    { key: 'type', label: 'Type', value: fm.type, type: 'text' },
    { key: 'autonomous', label: 'Autonomous', value: fm.autonomous, type: 'boolean' },
    { key: 'depends_on', label: 'Depends On', value: (fm.depends_on as string[])?.join(', '), type: 'text' },
    { key: 'files_modified', label: 'Files Modified', value: (fm.files_modified as string[])?.join(', '), type: 'textarea' },
    { key: 'requirements', label: 'Requirements', value: (fm.requirements as string[])?.join(', '), type: 'text' },
  ];
});
</script>

<template>
  <div class="frontmatter-form">
    <h3>Plan Metadata</h3>
    <div class="form-grid">
      <div v-for="field in fields" :key="field.key" class="form-field">
        <label>{{ field.label }}</label>
        <input
          v-if="field.type === 'text'"
          :value="String(field.value ?? '')"
          @input="emit('update', field.key, ($event.target as HTMLInputElement).value)"
        />
        <input
          v-else-if="field.type === 'number'"
          type="number"
          :value="Number(field.value ?? 0)"
          @input="emit('update', field.key, Number(($event.target as HTMLInputElement).value))"
        />
        <textarea
          v-else-if="field.type === 'textarea'"
          :value="String(field.value ?? '')"
          rows="2"
          @input="emit('update', field.key, ($event.target as HTMLTextAreaElement).value)"
        ></textarea>
        <label v-else-if="field.type === 'boolean'" class="checkbox-label">
          <input
            type="checkbox"
            :checked="Boolean(field.value)"
            @change="emit('update', field.key, ($event.target as HTMLInputElement).checked)"
          />
          {{ field.value ? 'Yes' : 'No' }}
        </label>
      </div>
    </div>
  </div>
</template>

<style scoped>
.frontmatter-form {
  background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 1rem; margin-bottom: 1rem;
}
h3 { font-size: 0.9rem; color: #8b949e; margin-bottom: 0.75rem; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem 1rem; }
.form-field label { display: block; font-size: 0.75rem; color: #8b949e; margin-bottom: 0.2rem; }
.form-field input, .form-field textarea {
  width: 100%; background: #0d1117; border: 1px solid #30363d; color: #e1e4e8;
  padding: 0.35rem 0.5rem; border-radius: 4px; font-size: 0.8rem; font-family: inherit;
}
.form-field textarea { resize: vertical; }
.checkbox-label { display: flex !important; align-items: center; gap: 0.4rem; font-size: 0.8rem !important; }
</style>
