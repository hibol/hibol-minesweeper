<script setup>
import { currentToast } from '../toastQueue'
</script>

<template>
  <Transition name="toast">
    <div v-if="currentToast" class="toast">
      <svg v-if="currentToast.icon" viewBox="0 0 9 9" class="toast-icon" shape-rendering="crispEdges">
        <rect v-for="(p, i) in currentToast.icon" :key="i" :x="p.x" :y="p.y" width="1" height="1" :fill="p.color" />
      </svg>
      <span class="toast-text">{{ currentToast.text }}</span>
    </div>
  </Transition>
</template>

<style scoped>
/* bottom un peu haut (pas 16px comme .give-up dans App.vue) : les deux
   partagent le même axe horizontal centré et pourraient sinon se superposer
   si un robot se déclenche pendant que "Give up" est déjà affiché. */
.toast {
  position: absolute;
  bottom: 64px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--color-panel-bg);
  border: 2px solid var(--color-chrome-border);
  box-shadow: 4px 4px 0 var(--color-border-soft);
  padding: 8px 14px;
  pointer-events: none;
  max-width: 90vw;
}

.toast-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.toast-text {
  font-family: 'VT323', monospace;
  font-size: 16px;
  letter-spacing: 1px;
  color: var(--color-text-strong);
  white-space: nowrap;
}

/* Même transition en escaliers que .win-banner (App.vue) : cohérent avec le
   reste du thème 8-bit plutôt qu'un fondu/slide lisse. */
.toast-enter-active,
.toast-leave-active {
  transition: transform 0.3s steps(4, end), opacity 0.3s steps(4, end);
}

.toast-enter-from,
.toast-leave-to {
  transform: translateX(-50%) translateY(150%);
  opacity: 0;
}
</style>
