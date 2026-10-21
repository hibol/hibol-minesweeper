import { playerId } from "./playerId"
import { categoryOf } from "./infinitePendingSubmissions"

// Meilleures valeurs que le serveur a acceptées, par catégorie : un push de run
// en cours (cf. infiniteOnline.js) n'est envoyé que s'il les dépasse. Rattaché
// au playerId : une sauvegarde importée d'un autre appareil ne doit pas
// empêcher d'envoyer ce que CE compte n'a jamais reçu.
const KEY = "hibol-minesweeper:infinite-pushed"

function load() {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY))
    if (stored?.playerId === playerId) {
      return stored
    }
  } catch {
    // corrompu / indisponible : rien de connu
  }
  return { playerId }
}

// Vrai si la run bat ce que le serveur a déjà (ou si rien n'est connu).
export function exceedsPushed(run) {
  const best = load()[categoryOf(run)]
  return (
    !best ||
    run.revealedCount > best.revealedCount ||
    run.maxDistance > best.maxDistance
  )
}

// `serverBest` : les maxima de la catégorie renvoyés par le serveur.
export function markPushed(run, serverBest) {
  const stored = load()
  stored[categoryOf(run)] = {
    revealedCount: serverBest.revealedCount,
    maxDistance: serverBest.maxDistance,
  }

  try {
    localStorage.setItem(KEY, JSON.stringify(stored))
  } catch {
    // Sans mémoire, le prochain déclencheur renverra : sans conséquence.
  }
}
