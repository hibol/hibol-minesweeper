<script setup>
// Purement présentationnel : le banner ne se ferme QUE sur expiration de son
// minuteur (géré dans App.vue), jamais au clic/tap — un achievement mérite
// d'être lu jusqu'au bout.
defineProps({
  show: Boolean,
  title: String,
  description: String,
  pixels: Array
})
</script>

<template>
  <Transition name="achievement-banner">
    <div v-if="show" class="achievement-banner">
      <div class="achievement-banner-eyebrow">ACHIEVEMENT UNLOCKED</div>
      <svg
        v-if="pixels"
        :viewBox="`0 0 ${pixels.width} ${pixels.height}`"
        class="achievement-banner-icon"
        shape-rendering="crispEdges"
      >
        <rect v-for="(p, i) in pixels" :key="i" :x="p.x" :y="p.y" width="1" height="1" :fill="p.color" />
      </svg>
      <div class="achievement-banner-title">{{ title }}</div>
      <div class="achievement-banner-sub">{{ description }}</div>
    </div>
  </Transition>
</template>

<style scoped>
/* Même coquille que .win-banner (WinBanner.vue/GameOverBanner.vue), mais sans
   dismiss au clic : ce banner ne part qu'au bout de son minuteur (App.vue). */
.achievement-banner {
  position: absolute;
  top: 16px;
  left: 50%;
  transform: translate(-50%, 0);
  z-index: 2;
  background: var(--color-panel-bg);
  border: 2px solid var(--color-chrome-border);
  box-shadow: 4px 4px 0 var(--color-border-soft);
  padding: 10px 20px;
  max-width: 260px;
  text-align: center;
}

/* Plus petit que le titre (VT323 + letter-spacing plutôt que Press Start
   2P) : un en-tête discret, pas une deuxième ligne de titre. */
.achievement-banner-eyebrow {
  font-family: 'VT323', monospace;
  font-size: 12px;
  letter-spacing: 2px;
  color: var(--color-text);
  opacity: 0.7;
}

.achievement-banner-icon {
  margin-top: 6px;
  width: 32px;
  height: 32px;
}

.achievement-banner-title {
  margin-top: 6px;
  font-family: 'Press Start 2P', monospace;
  font-size: 15px;
  color: var(--color-text-strong);
}

.achievement-banner-sub {
  margin-top: 8px;
  font-family: 'VT323', monospace;
  font-size: 15px;
  color: var(--color-text);
  letter-spacing: 1px;
  line-height: 1.3;
}

/* Même transition en escaliers que .win-banner. */
.achievement-banner-enter-active,
.achievement-banner-leave-active {
  transition: transform 0.4s steps(6, end), opacity 0.4s steps(6, end);
}

.achievement-banner-enter-from,
.achievement-banner-leave-to {
  transform: translate(-50%, -150%);
  opacity: 0;
}
</style>
