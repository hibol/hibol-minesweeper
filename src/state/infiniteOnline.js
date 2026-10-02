import { playerId, onlineSuspended } from "./playerId"
import { username, generateRandomUsername } from "./username"
import { pushToast } from "./toastQueue"
import {
  savePendingInfiniteRun,
  resolvePendingInfiniteRun,
  listPendingInfiniteRuns,
} from "./infinitePendingSubmissions"

// Même serveur/contrat vérifié que legacyOnline.js (pas de convention
// VITE_... dans ce repo).
const API_BASE = "https://hibol-minesweeper-api.chez-miette.xyz"

// Refus définitifs du serveur (`reason` dans le corps JSON), à distinguer
// d'une panne (réseau, 5xx, 429...), seule à justifier un renvoi plus tard.
const REFUSAL_STATUSES = [400, 409]
// Refus qui visent la run elle-même : inutile de la renvoyer un jour.
const RUN_REFUSAL_REASONS = ["invalid_stats", "invalid_request"]

async function postSubmission(body) {
  const response = await fetch(`${API_BASE}/api/infinite/submissions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

  if (!response.ok && !REFUSAL_STATUSES.includes(response.status)) {
    throw new Error(`submission failed: ${response.status}`)
  }

  return response.json()
}

// Envoie une run et tient la file d'attente à jour. Renvoie la réponse du
// serveur, ou null si l'envoi a échoué (run mise en attente).
async function sendRun(run) {
  let result
  try {
    result = await postSubmission({
      playerId,
      username: username.value || generateRandomUsername(),
      usedMachines: run.usedMachines,
      maxDistance: run.maxDistance,
      revealedCount: run.revealedCount,
      minesTriggered: run.minesTriggered,
      heartsCollected: run.heartsCollected,
      robotsTriggered: run.robotsTriggered,
    })
  } catch {
    savePendingInfiniteRun(run)
    return null
  }

  if (result.accepted) {
    // `result` porte les maxima du serveur pour cette catégorie.
    resolvePendingInfiniteRun(run, result)
  } else if (RUN_REFUSAL_REASONS.includes(result.reason)) {
    resolvePendingInfiniteRun(run)
  } else {
    // Refus lié à l'identité (username_taken...) : la run reste valable,
    // retentée une fois le pseudo réglé.
    savePendingInfiniteRun(run)
  }

  return result
}

// Soumet une run Infini (au Give Up) au classement en ligne. Pas de rejeu
// anti-triche : le client déclare ses stats, le serveur applique ses bornes de
// vraisemblance et dérive `category` de usedMachines. Le score local
// (runHistory.js) est acquis indépendamment : un échec n'est jamais remonté
// au joueur, la run part en file d'attente (infinitePendingSubmissions.js).
export async function submitInfiniteRun(run) {
  if (onlineSuspended) {
    return
  }

  const result = await sendRun(run)

  if (result?.accepted && result.improved) {
    // `improved` ne dit pas laquelle des deux métriques a été battue (cf.
    // contrat serveur) — message générique plutôt que de nommer "cells" à
    // tort pour une run qui n'aurait amélioré que la distance.
    pushToast("New personal best!", {
      durationMs: 4000,
    })
  }
}

// Renvoie les runs en attente, au boot et au retour du réseau (cf. App.vue).
// Sans toast : le joueur ne relierait pas un record annoncé à froid à une run
// jouée hors ligne il y a longtemps.
export async function retryPendingInfiniteRuns() {
  if (onlineSuspended) {
    return
  }

  for (const run of listPendingInfiniteRuns()) {
    // Toujours hors ligne : inutile d'essayer les suivantes.
    if (!(await sendRun(run))) {
      return
    }
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
