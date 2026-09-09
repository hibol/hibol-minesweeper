<script setup>
// Fin de partie du mode Legacy. Deux variantes : "won" / "lost". Même famille
// visuelle que WinBanner / GameOverBanner (cadre pixel, transition en steps),
// fermée par un clic n'importe où dessus.
defineProps({
  show: Boolean,
  variant: {
    type: String,
    default: null // "won" | "lost" | null
  },
  // Chrono figé, déjà formaté (ex. "042").
  timeLabel: {
    type: String,
    default: ''
  },
  // Rang 1-indexé dans la table des meilleurs temps de la difficulté, ou null
  // si la partie n'entre pas dans le top (branché en Phase 2).
  rank: {
    type: Number,
    default: null
  }
})

defineEmits(['close'])
</script>

<template>
  <Transition name="win-banner">
    <div v-if="show && variant" class="win-banner" @click="$emit('close')">
      <div class="win-banner-title">{{ variant === 'won' ? 'YOU WIN' : 'BOOM' }}</div>
      <div class="win-banner-sub">TIME {{ timeLabel }}</div>
      <div v-if="variant === 'won' && rank === 1" class="win-banner-sub">NEW BEST!</div>
      <div v-else-if="variant === 'won' && rank" class="win-banner-sub">TOP {{ rank }}</div>
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

/* Transition en escaliers (steps) comme les autres bannières : colle au thème
   8-bit mieux qu'un fondu/slide continu. */
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
