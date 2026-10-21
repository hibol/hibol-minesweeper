import { watch } from "vue"
import { isMeaningfulProgress } from "../gameModes"
import { loadActiveGame } from "../state/gameStorage"
import {
  pushInfiniteProgress,
  runFromGame,
  runFromSnapshot,
} from "../state/infiniteOnline"

// Une session qui reste ouverte des heures apparaît quand même au classement :
// un push tous les 5 000 cases révélées.
export const PUSH_STEP_CELLS = 5000

// Envoie au classement la run Infini en cours, sans attendre le Give Up.
// Déclencheurs ici : reprise d'une partie et palier de cases ; les autres
// appellent `pushProgress` (onglet masqué, classement ouvert). Le dédoublonnage
// est dans pushInfiniteProgress : rappeler sans progrès n'envoie rien.
export function useInfiniteProgressPush(game) {
  // La partie vivante si c'est elle l'Infini en cours (le slot sauvegardé n'est
  // écrit qu'à certains moments, donc en retard), sinon le slot : le joueur est
  // dans un autre mode.
  function currentRun() {
    const live = game.value
    if (live.mode === "infinite" && live.status === "playing") {
      return isMeaningfulProgress("infinite", live.status, live.revealedCount)
        ? runFromGame(live)
        : null
    }

    const saved = loadActiveGame("infinite")
    return saved &&
      isMeaningfulProgress("infinite", saved.status, saved.revealedCount)
      ? runFromSnapshot(saved)
      : null
  }

  // Ne rejette jamais : un push raté ne doit rien casser autour.
  async function pushProgress({ keepalive = false } = {}) {
    try {
      const run = currentRun()
      if (run) {
        await pushInfiniteProgress(run, { keepalive })
      }
    } catch {
      // Réessayé au prochain déclencheur.
    }
  }

  // Reprise : partie restaurée au démarrage, mode retrouvé ou nouvelle partie
  // (watch d'une ref : seulement quand la partie est remplacée).
  watch(game, () => {
    if (game.value.mode === "infinite") {
      pushProgress()
    }
  })

  // null hors Infini : changer de partie ne compte pas comme un palier (la
  // reprise ci-dessus s'en charge).
  watch(
    () =>
      game.value.mode === "infinite"
        ? Math.floor(game.value.revealedCount / PUSH_STEP_CELLS)
        : null,
    (step, previousStep) => {
      if (step !== null && previousStep !== null && step > previousStep) {
        pushProgress()
      }
    },
  )

  return { pushProgress }
}
