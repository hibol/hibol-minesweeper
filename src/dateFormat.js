// Dates affichées dans le menu, au format local du joueur.

// Date et heure (runs locales, succès débloqués).
export function formatDateTime(timestamp) {
  const date = new Date(timestamp)
  return `${date.toLocaleDateString()} ${formatClockTime(date)}`
}

// Date seule (classements) ; vide si absente.
export function formatDate(timestamp) {
  return timestamp ? new Date(timestamp).toLocaleDateString() : ""
}

// Heure:minute (expiration d'un code de pairage) ; vide si absente.
export function formatClockTime(value) {
  return value
    ? new Date(value).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : ""
}

// Clé de jour de la chasse : "20261004" -> "2026-10-04".
export function formatDayKey(dayKey) {
  return `${dayKey.slice(0, 4)}-${dayKey.slice(4, 6)}-${dayKey.slice(6, 8)}`
}
