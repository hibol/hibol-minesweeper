<script setup>
defineProps({
  show: Boolean,
  revealedCount: Number,
  maxDistance: Number,
  rank: {
    type: Number,
    default: null
  }
})

defineEmits(['close'])
</script>

<template>
  <Transition name="win-banner">
    <div v-if="show" class="win-banner" @click="$emit('close')">
      <div class="win-banner-title">GAME OVER</div>
      <div class="win-banner-sub">CELLS {{ revealedCount }}</div>
      <div class="win-banner-sub">DISTANCE {{ maxDistance }}</div>
      <div v-if="rank" class="win-banner-sub">TOP {{ rank }} RUN!</div>
    </div>
  </Transition>
</template>

<style scoped>
.win-banner {
  position: absolute;
  top: 16px;
  left: 50%;
  transform: translate(-50%, 0);
  z-index: 2;
  background: var(--color-panel-bg);
  border: 2px solid var(--color-chrome-border);
  box-shadow: 4px 4px 0 var(--color-border-soft);
  padding: 10px 20px;
  text-align: center;
  cursor: pointer;
}

.win-banner-title {
  font-family: 'Press Start 2P', monospace;
  font-size: 18px;
  color: var(--color-text-strong);
}

.win-banner-sub {
  margin-top: 8px;
  font-family: 'VT323', monospace;
  font-size: 15px;
  color: var(--color-text);
  letter-spacing: 1px;
}

/* Transition en escaliers (steps) plutôt qu'un easing lisse : un mouvement
   saccadé colle davantage au thème 8-bit qu'un fondu/slide continu. */
.win-banner-enter-active,
.win-banner-leave-active {
  transition: transform 0.4s steps(6, end), opacity 0.4s steps(6, end);
}

.win-banner-enter-from,
.win-banner-leave-to {
  transform: translate(-50%, -150%);
  opacity: 0;
}
</style>
