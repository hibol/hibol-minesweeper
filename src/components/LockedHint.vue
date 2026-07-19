<script setup>
defineProps({
  show: Boolean
})
</script>

<template>
  <Transition name="locked-hint">
    <div v-if="show" class="locked-hint">You must prove your worth</div>
  </Transition>
</template>

<style scoped>
.locked-hint {
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  margin-top: 8px;
  z-index: 3;
  background: var(--color-panel-bg);
  border: 2px solid var(--color-chrome-border);
  box-shadow: 2px 2px 0 var(--color-border-soft);
  padding: 6px 10px;
  font-family: 'VT323', monospace;
  font-size: 14px;
  color: var(--color-text-strong);
  white-space: nowrap;
  pointer-events: none;
}

/* Même style de transition en escaliers que les autres popups (WinBanner,
   GameOverBanner) : cohérent avec le thème 8-bit du reste du projet. */
.locked-hint-enter-active,
.locked-hint-leave-active {
  transition: transform 0.3s steps(4, end), opacity 0.3s steps(4, end);
}

.locked-hint-enter-from,
.locked-hint-leave-to {
  transform: translate(-50%, -6px);
  opacity: 0;
}
</style>
