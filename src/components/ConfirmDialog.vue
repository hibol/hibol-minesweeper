<script setup>
import { ref, useId } from 'vue'
import { useModalA11y } from '../composables/useModalA11y'

const props = defineProps({
  show: Boolean,
  title: String,
  message: String,
  confirmLabel: {
    type: String,
    default: 'Confirm'
  }
})

const emit = defineEmits(['cancel', 'confirm'])

const box = ref(null)
const titleId = useId()
useModalA11y(() => props.show, box, () => emit('cancel'))
</script>

<template>
  <div v-if="show" class="confirm-overlay" @click.self="$emit('cancel')">
    <div ref="box" class="confirm-box" role="dialog" aria-modal="true" :aria-labelledby="titleId" tabindex="-1">
      <div :id="titleId" class="confirm-title">{{ title }}</div>
      <div class="confirm-sub">{{ message }}</div>
      <div class="confirm-actions">
        <button class="pixel-btn" @click="$emit('cancel')">Cancel</button>
        <button class="pixel-btn" @click="$emit('confirm')">{{ confirmLabel }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.confirm-overlay {
  position: fixed;
  inset: 0;
  z-index: 10;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
}

.confirm-box {
  background: var(--color-panel-bg);
  border: 2px solid var(--color-chrome-border);
  box-shadow: 4px 4px 0 var(--color-border-soft);
  padding: 16px 20px;
  text-align: center;
  font-family: 'VT323', monospace;
}

.confirm-title {
  font-family: 'Press Start 2P', monospace;
  font-size: 15px;
  color: var(--color-text-strong);
}

.confirm-sub {
  margin-top: 8px;
  font-size: 15px;
  color: var(--color-text);
}

.confirm-actions {
  display: flex;
  gap: 10px;
  justify-content: center;
  margin-top: 14px;
}
</style>
