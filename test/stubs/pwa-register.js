import { ref } from 'vue'

// Stub de 'virtual:pwa-register/vue' (fourni par vite-plugin-pwa, absent en
// test). PwaUpdatePrompt.vue n'en lit que needRefresh + updateServiceWorker.
export function useRegisterSW() {
  return {
    needRefresh: ref(false),
    offlineReady: ref(false),
    updateServiceWorker() {},
  }
}
