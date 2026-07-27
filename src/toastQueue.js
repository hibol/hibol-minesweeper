import { ref } from 'vue'

const DEFAULT_DURATION_MS = 1000

// Ref partagée (singleton, cf. settings.js) : un seul toast affiché à la
// fois, une file FIFO derrière pour ne pas se marcher dessus si plusieurs
// messages arrivent d'affilée (ex. deux robots déclenchés dans la même
// cascade, cf. App.vue). Générique par conception (roadmap point 6) : sert
// aux robots aujourd'hui, à un tuto plus tard — les achievements reprendront
// plutôt le style WinBanner/GameOverBanner, pas ce composable.
export const currentToast = ref(null)

const queue = []
let dismissTimeout = null

function showNext() {
  if (queue.length === 0) {
    currentToast.value = null
    return
  }

  currentToast.value = queue.shift()
  clearTimeout(dismissTimeout)
  dismissTimeout = setTimeout(showNext, currentToast.value.durationMs ?? DEFAULT_DURATION_MS)
}

export function pushToast(text, { icon = null, durationMs } = {}) {
  queue.push({ text, icon, durationMs })

  if (!currentToast.value) {
    showNext()
  }
}
