import { ref } from "vue"
import { isSeen, markSeen } from "../state/seenFlag"

// Dialogue d'introduction « vu une fois » : maybeShow() l'ouvre tant que
// `storageKey` n'a pas été posé, dismiss(dontShowAgain) le ferme et ne pose la
// clé que si le joueur a coché « ne plus afficher ». `enabled: false` (ex.
// appareil non tactile) l'empêche de s'ouvrir.
export function useIntroDialog(storageKey, { enabled = true } = {}) {
  const show = ref(false)

  function maybeShow() {
    if (enabled && !isSeen(storageKey)) {
      show.value = true
    }
  }

  function dismiss(dontShowAgain) {
    show.value = false
    if (dontShowAgain) {
      markSeen(storageKey)
    }
  }

  return { show, maybeShow, dismiss }
}
