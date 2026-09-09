import { computed, ref } from 'vue'

// Chrono de run réutilisable (mode Legacy pour l'instant ; la chasse au trésor
// a encore le sien inline dans App.vue, à migrer un jour).
//
// Modèle repris de ce chrono : `runningSince` = timestamp du dernier resume
// (null quand en pause), `accumMs` = temps cumulé des périodes actives
// passées. Un ref `nowTick`, incrémenté par un setInterval, sert de seule
// dépendance réactive à `elapsedMs` — on évite d'écrire l'heure courante dans
// un ref à chaque frame. `started` distingue "jamais lancé" (le 1er coup joué
// n'a pas encore eu lieu) de "en pause".
export function useRunTimer({ tickMs = 500 } = {}) {
  const nowTick = ref(0)
  let accumMs = 0
  let runningSince = null
  let started = false
  let interval = null

  const elapsedMs = computed(() => {
    nowTick.value // dépendance : force le recalcul à chaque tick
    const live = runningSince !== null ? performance.now() - runningSince : 0
    return accumMs + live
  })

  function resume() {
    if (runningSince !== null || !started) {
      return
    }
    runningSince = performance.now()
    clearInterval(interval)
    interval = setInterval(() => { nowTick.value++ }, tickMs)
  }

  function pause() {
    if (runningSince === null) {
      return
    }
    accumMs += performance.now() - runningSince
    runningSince = null
    clearInterval(interval)
    interval = null
    nowTick.value++
  }

  // 1er coup joué : démarre le chrono (ou le relance s'il était juste en pause).
  function start() {
    started = true
    resume()
  }

  // Nouvelle partie : tout à zéro, chrono à l'arrêt jusqu'au prochain start().
  function reset() {
    pause()
    accumMs = 0
    started = false
    nowTick.value++
  }

  // Reprise d'une partie sauvegardée : restaure le temps déjà écoulé. Reste en
  // pause — un resume() explicite le relance (cf. App.vue). `alreadyStarted`
  // dit si le 1er coup avait déjà été joué : sinon resume() reste inerte tant
  // que le joueur n'a pas révélé sa 1re case.
  function restore(elapsed, alreadyStarted = true) {
    pause()
    accumMs = Math.max(0, elapsed || 0)
    started = alreadyStarted
    nowTick.value++
  }

  return { elapsedMs, start, pause, resume, reset, restore }
}
