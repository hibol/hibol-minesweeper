import { pushToast } from "./toastQueue"

const WARN_INTERVAL_MS = 60_000
const WARN_TOAST_MS = 4000

let lastWarnAt = -Infinity

// Au plus un message par minute : les sauvegardes sont fréquentes.
function warnOnce() {
  const now = Date.now()
  if (now - lastWarnAt >= WARN_INTERVAL_MS) {
    lastWarnAt = now
    pushToast("Storage full: progress can't be saved", {
      durationMs: WARN_TOAST_MS,
    })
  }
}

// Écrit une clé du jeu. Renvoie false si le navigateur refuse (quota plein,
// stockage indisponible) : le joueur est prévenu, la valeur en mémoire reste bonne.
export function writeItem(key, value) {
  try {
    localStorage.setItem(key, value)
    return true
  } catch {
    warnOnce()
    return false
  }
}

// Idem avec sérialisation JSON (une valeur non sérialisable compte comme un échec).
export function writeJson(key, value) {
  try {
    return writeItem(key, JSON.stringify(value))
  } catch {
    warnOnce()
    return false
  }
}

// Pour les tests : relance l'anti-répétition.
export function resetWriteWarning() {
  lastWarnAt = -Infinity
}
