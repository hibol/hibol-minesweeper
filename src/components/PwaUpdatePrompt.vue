<script setup>
// Intégration Vue de vite-plugin-pwa. `virtual:pwa-register/vue` est un
// module virtuel fourni par le plugin (résolu au build) : useRegisterSW()
// enregistre le service worker et expose des refs réactives.
//   - needRefresh : une nouvelle version est en attente (registerType
//                   'prompt' → elle ne s'active pas toute seule). C'est le
//                   seul cas qui mérite une bannière — on ignore
//                   volontairement `offlineReady` (message ponctuel au tout
//                   premier chargement, sans intérêt pour le joueur).
// updateServiceWorker(true) active le SW en attente puis recharge la page.
import { useRegisterSW } from 'virtual:pwa-register/vue'

const { needRefresh, updateServiceWorker } = useRegisterSW()
</script>

<template>
  <Transition name="pwa-toast">
    <div v-if="needRefresh" class="pwa-toast" role="alert">
      <div class="pwa-toast-msg">New version available.</div>
      <div class="pwa-toast-actions">
        <button class="pixel-btn" @click="updateServiceWorker(true)">Reload</button>
        <button class="pixel-btn" @click="needRefresh = false">Dismiss</button>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
/* Même coquille visuelle que .achievement-banner, mais ancrée en bas pour ne
   pas chevaucher les bannières du haut. position: fixed (pas absolute) : le
   prompt de MAJ n'appartient à aucune vue de jeu en particulier. */
.pwa-toast {
  position: fixed;
  bottom: 16px;
  left: 50%;
  transform: translate(-50%, 0);
  z-index: 10;
  background: var(--color-panel-bg);
  border: 2px solid var(--color-chrome-border);
  box-shadow: 4px 4px 0 var(--color-border-soft);
  padding: 12px 16px;
  max-width: 280px;
  text-align: center;
}

.pwa-toast-msg {
  font-family: 'VT323', monospace;
  font-size: 16px;
  letter-spacing: 1px;
  color: var(--color-text-strong);
  line-height: 1.3;
}

.pwa-toast-actions {
  margin-top: 10px;
  display: flex;
  gap: 8px;
  justify-content: center;
}

/* Même transition en escaliers que les autres bannières. */
.pwa-toast-enter-active,
.pwa-toast-leave-active {
  transition: transform 0.4s steps(6, end), opacity 0.4s steps(6, end);
}

.pwa-toast-enter-from,
.pwa-toast-leave-to {
  transform: translate(-50%, 150%);
  opacity: 0;
}
</style>
