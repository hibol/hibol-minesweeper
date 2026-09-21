import { playerId } from "./playerId"
import { username, generateRandomUsername } from "./username"
import { pushToast } from "./toastQueue"

// Même serveur/contrat vérifié que legacyOnline.js (pas de convention
// VITE_... dans ce repo).
const API_BASE = "https://hibol-minesweeper-api.chez-miette.xyz"

async function postSubmission(body) {
  const response = await fetch(`${API_BASE}/api/infinite/submissions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw new Error(`submission failed: ${response.status}`)
  }

  return response.json()
}

// Soumet une run Infini (au Give Up) au classement en ligne. Contrairement à
// Legacy, aucun rejeu anti-triche : le client déclare ses stats de fin de
// run, le serveur applique ses propres bornes de vraisemblance et dérive
// `category` ("clean"/"assisted") de usedMachines — jamais envoyée
// directement. Le score local (runHistory.js) est déjà acquis indépendamment
// de cet appel : toute erreur réseau/refus serveur est avalée silencieusement,
// jamais remontée au joueur — une run Infini abandonnée ne se retente pas
// comme une victoire Legacy manquée (pas de file d'attente ici).
export async function submitInfiniteRun({
  usedMachines,
  maxDistance,
  revealedCount,
  minesTriggered,
  heartsCollected,
  robotsTriggered,
}) {
  try {
    const result = await postSubmission({
      playerId,
      username: username.value || generateRandomUsername(),
      usedMachines,
      maxDistance,
      revealedCount,
      minesTriggered,
      heartsCollected,
      robotsTriggered,
    })

    if (result.accepted && result.improved) {
      // `improved` ne dit pas laquelle des deux métriques a été battue (cf.
      // contrat serveur) — message générique plutôt que de nommer "cells" à
      // tort pour une run qui n'aurait amélioré que la distance.
      pushToast("New personal best!", {
        durationMs: 4000,
      })
    }
  } catch {
    // Hors ligne / serveur down / timeout / refus (invalid_stats,
    // username_taken...) : rien à faire, le score local reste acquis.
  }
}

// Classement en ligne Infini : 4 tableaux distincts (metric x category), déjà
// triés décroissant par le serveur (plus grand = mieux, contrairement à
// Legacy) — le rang, c'est l'index + 1, pas de champ `rank` par entrée (même
// principe que fetchLegacyLeaderboard). Lève en cas d'échec réseau/HTTP : à
// l'appelant de décider de l'affichage (cf. BurgerMenu.vue).
export async function fetchInfiniteLeaderboard(metric, category, limit = 50) {
  const response = await fetch(
    `${API_BASE}/api/infinite/leaderboard?metric=${metric}&category=${category}&limit=${limit}`,
  )

  if (!response.ok) {
    throw new Error(`leaderboard fetch failed: ${response.status}`)
  }

  return response.json()
}
