// Drapeau « déjà vu » persisté (introductions, indices) : la clé vaut "true"
// une fois posée. Un seul endroit pour la lecture et l'écriture.
export function isSeen(key) {
  return localStorage.getItem(key) === "true"
}

export function markSeen(key) {
  localStorage.setItem(key, "true")
}
