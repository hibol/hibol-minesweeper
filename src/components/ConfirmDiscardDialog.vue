<script setup>
defineProps({
  show: Boolean,
  revealedCount: Number
})

defineEmits(['cancel', 'confirm'])
</script>

<template>
  <div v-if="show" class="confirm-overlay" @click.self="$emit('cancel')">
    <div class="confirm-box">
      <div class="confirm-title">DISCARD CURRENT RUN?</div>
      <div class="confirm-sub">{{ revealedCount }} cells explored will be lost</div>
      <div class="confirm-actions">
        <button class="pixel-btn" @click="$emit('cancel')">Cancel</button>
        <button class="pixel-btn" @click="$emit('confirm')">Discard</button>
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
