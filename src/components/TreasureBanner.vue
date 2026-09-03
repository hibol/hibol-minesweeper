<script setup>
// Bannière de fin de journée de la chasse au trésor (roadmap point 10). Deux
// états, run continu à 3 vies (révisé 2026-09-03, plus de "tentatives") :
//  - 'won'  : coffre trouvé → récompense + temps
//  - 'lost' : 3e mine touchée → temps
// Style repris de WinBanner.vue / GameOverBanner.vue (panneau centré haut,
// transition en escaliers).
defineProps({
  show: Boolean,
  variant: String,
  // Gain de CETTE victoire (toujours 1 en v0), distinct de la récompense
  // cumulée — c'est le "+1" qu'on veut voir sur la bannière.
  rewardEarned: {
    type: Number,
    default: 1
  },
  timeLabel: String
})

defineEmits(['close'])
</script>

<template>
  <Transition name="treasure-banner">
    <div v-if="show" class="treasure-banner">
      <template v-if="variant === 'won'">
        <div class="treasure-banner-title">YOU WIN</div>
        <div class="treasure-banner-sub">+{{ rewardEarned }} reward</div>
        <div class="treasure-banner-sub">Time {{ timeLabel }}</div>
        <button class="pixel-btn treasure-banner-btn" @click="$emit('close')">OK</button>
      </template>

      <template v-else>
        <div class="treasure-banner-title">GAME OVER</div>
        <div class="treasure-banner-sub">3 mines — the treasure got away</div>
        <div class="treasure-banner-sub">Time {{ timeLabel }}</div>
        <button class="pixel-btn treasure-banner-btn" @click="$emit('close')">OK</button>
      </template>
    </div>
  </Transition>
</template>

<style scoped>
.treasure-banner {
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
}

.treasure-banner-title {
  font-family: 'Press Start 2P', monospace;
  font-size: 18px;
  color: var(--color-text-strong);
}

.treasure-banner-sub {
  margin-top: 8px;
  font-family: 'VT323', monospace;
  font-size: 15px;
  color: var(--color-text);
  letter-spacing: 1px;
}

.treasure-banner-btn {
  margin-top: 12px;
}

/* Transition en escaliers (steps) plutôt qu'un easing lisse : cohérent avec
   WinBanner/GameOverBanner. */
.treasure-banner-enter-active,
.treasure-banner-leave-active {
  transition: transform 0.4s steps(6, end), opacity 0.4s steps(6, end);
}

.treasure-banner-enter-from,
.treasure-banner-leave-to {
  transform: translate(-50%, -150%);
  opacity: 0;
}
</style>
