import { ref } from "vue"
import { peekActiveGame } from "../state/gameStorage"
import { MODES, isMeaningfulProgress, isMeaningfulRun } from "../gameModes"

// Parties en pause dans les slots des modes : le marqueur sous les boutons de
// mode, et la question « démarrer ici écraserait-il une partie à garder ? ».
// refreshPausedModes() est à rappeler après tout changement de slot ou de mode.
export function usePausedModes(game) {
  // Marqueur "partie en pause" : un slot non vide dont le mode n'est pas celui
  // affiché à l'écran.
  const pausedModes = ref({})

  function refreshPausedModes() {
    const marks = {}
    for (const mode of MODES) {
      marks[mode] = mode !== game.value.mode && peekActiveGame(mode) !== null
    }
    pausedModes.value = marks
  }

  // Vrai si démarrer une partie neuve dans `mode` écraserait une partie en cours
  // qui mérite la confirmation — que ce soit celle à l'écran ou celle en pause
  // dans le slot de ce mode.
  function meaningfulGameInMode(mode) {
    if (game.value.mode === mode) {
      return isMeaningfulRun(game.value)
    }
    const paused = peekActiveGame(mode)
    return paused
      ? isMeaningfulProgress(mode, "playing", paused.revealedCount)
      : false
  }

  return { pausedModes, refreshPausedModes, meaningfulGameInMode }
}
