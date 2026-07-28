<script setup>
import { ref } from 'vue'

defineProps({
  show: Boolean,
  titleLines: {
    type: Array,
    default: () => []
  },
  message: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['close'])

const dontShowAgain = ref(false)

function close() {
  emit('close', dontShowAgain.value)
  dontShowAgain.value = false
}
</script>

<template>
  <div v-if="show" class="intro-overlay" @click.self="close">
    <div class="intro-box">
      <div v-for="line in titleLines" :key="line" class="intro-title">{{ line }}</div>
      <div class="intro-sub">{{ message }}</div>
      <label class="intro-checkbox">
        <input type="checkbox" v-model="dontShowAgain" />
        Don't show this again
      </label>
      <div class="intro-actions">
        <button class="pixel-btn" @click="close">Got it</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.intro-overlay {
  position: fixed;
  inset: 0;
  z-index: 10;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
}

.intro-box {
  background: var(--color-panel-bg);
  border: 2px solid var(--color-chrome-border);
  box-shadow: 4px 4px 0 var(--color-border-soft);
  padding: 20px 24px;
  max-width: 320px;
  text-align: center;
  font-family: 'VT323', monospace;
}

.intro-title {
  font-family: 'Press Start 2P', monospace;
  font-size: 13px;
  color: var(--color-text-strong);
  line-height: 1.6;
}

.intro-sub {
  margin-top: 12px;
  font-size: 16px;
  color: var(--color-text);
}

.intro-checkbox {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 16px;
  font-size: 14px;
  color: var(--color-text);
  cursor: pointer;
}

.intro-checkbox input[type="checkbox"] {
  appearance: none;
  width: 14px;
  height: 14px;
  margin: 0;
  border: 2px solid var(--color-chrome-border);
  background: var(--color-panel-bg);
  cursor: pointer;
}

.intro-checkbox input[type="checkbox"]:checked {
  background: var(--color-chrome-border);
}

.intro-actions {
  margin-top: 16px;
}
</style>
