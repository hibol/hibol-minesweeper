import { ref } from "vue"
import { playerId } from "./playerId"
import { username, generateRandomUsername } from "./username"
import {
  pendingLegacySubmissions,
  savePendingSubmission,
  resolvePendingSubmission,
} from "./legacyPendingSubmissions"

// Contrat vérifié dans temp/legacy-server-integration.md — pas de convention
// VITE_... existante dans ce repo (1er fetch du projet), donc en dur ici.
const API_BASE = "https://hibol-minesweeper-api.chez-miette.xyz"

// Résultat de la dernière soumission Legacy au serveur : { accepted, timeMs,
// rank, reason }, ou null tant qu'aucune n'a abouti (jamais essayé, ou
// échec réseau avalé silencieusement ci-dessous). Pour un futur affichage
// (cf. doc §3, point 3 — décision UX pas encore tranchée) : rien ne le lit
// aujourd'hui.
export const lastLegacySubmission = ref(null)

async function postSubmission(body) {
  const response = await fetch(`${API_BASE}/api/legacy/submissions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  return response.json()
}

// Classement en ligne d'une difficulté, déjà trié par timeMs croissant par
// le serveur (le rang, c'est l'index + 1, pas de champ `rank` par entrée).
// Lève en cas d'échec réseau/HTTP : à l'appelant de décider de l'affichage
// (cf. BurgerMenu.vue, page LEGACY TIMES).
export async function fetchLegacyLeaderboard(difficulty, limit = 50) {
  const response = await fetch(
    `${API_BASE}/api/legacy/leaderboard?difficulty=${difficulty}&limit=${limit}`,
  )

  if (!response.ok) {
    throw new Error(`leaderboard fetch failed: ${response.status}`)
  }

  return response.json()
}

// Meilleur temps déjà enregistré côté serveur pour ce playerId/difficulty —
// `null` si aucun score pour l'instant. Lève en cas d'échec réseau/HTTP :
// l'appelante (submitLegacyWin) décide quoi faire de cet échec, pas cette
// fonction (elle reste un simple GET, symétrique à fetchLegacyLeaderboard).
async function fetchServerBest(difficulty) {
  const response = await fetch(
    `${API_BASE}/api/legacy/players/${playerId}/best?difficulty=${difficulty}`,
  )

  if (!response.ok) {
    throw new Error(`best fetch failed: ${response.status}`)
  }

  const { timeMs } = await response.json()
  return timeMs
}

// Marge de sécurité (ms) avant de sauter la soumission : le chrono local
// (performance.now()) et celui recalculé par le rejeu serveur devraient
// normalement coïncider, mais ce fichier ne les compare jamais ailleurs (cf.
// submitLegacyWin plus bas) — sans marge, un léger écart de mesure pourrait
// sauter à tort un vrai record. Pure optimisation (cf.
// temp/legacy-server-integration.md §4) : l'unicité par joueur reste de
// toute façon garantie côté serveur (upsert), ce court-circuit ne peut
// jamais faire perdre un score, juste économiser un rejeu inutile — en cas
// de doute, mieux vaut soumettre un coup pour rien que sauter un record.
const BEST_CHECK_MARGIN_MS = 250

// Soumet une victoire Legacy pour le classement en ligne. Le score local
// (legacyScores.js) est déjà acquis indépendamment de cet appel : toute
// erreur réseau (offline, serveur down, timeout, réponse non-JSON) est
// avalée silencieusement, jamais remontée au joueur.
export async function submitLegacyWin({
  difficulty,
  seed,
  moves,
  localTimeMs,
}) {
  // Le check "vaut le coup ?" est volontairement hors du try/catch de la
  // soumission : un échec ici (réseau, timeout...) ne doit jamais empêcher
  // la vraie tentative de soumission qui suit, juste sauter l'optimisation.
  const serverBest = await fetchServerBest(difficulty).catch(() => null)

  if (serverBest !== null && localTimeMs >= serverBest + BEST_CHECK_MARGIN_MS) {
    // Le serveur a déjà au moins aussi bien : une éventuelle soumission en
    // attente de cette difficulté (cf. legacyPendingSubmissions.js) n'a plus
    // lieu d'être retentée SI elle n'était pas meilleure que cette run.
    resolvePendingSubmission(difficulty, localTimeMs)
    return
  }

  try {
    let result = await postSubmission({
      playerId,
      username: username.value || generateRandomUsername(),
      difficulty,
      seed,
      moves,
    })

    // username_taken n'arrive qu'au tout 1er essai de ce playerId (le serveur
    // ignore ensuite silencieusement le champ username) — un seul retry avec
    // un nouveau pseudo tiré au sort suffit, pas d'UX à inventer.
    if (result.reason === "username_taken") {
      result = await postSubmission({
        playerId,
        username: generateRandomUsername(),
        difficulty,
        seed,
        moves,
      })
    }

    lastLegacySubmission.value = result
    // Réponse définitive du serveur (acceptée ou non) pour cette run : idem
    // ci-dessus, plus la peine de retenter une soumission en attente qui
    // n'était pas meilleure.
    resolvePendingSubmission(difficulty, localTimeMs)
  } catch {
    // Hors ligne / serveur down / timeout : le joueur garde son score local,
    // juste pas de rang en ligne pour cette run MAINTENANT — on la garde en
    // attente (si elle est le meilleur échec connu pour cette difficulté)
    // pour la retenter plus tard (cf. retryPendingLegacySubmissions).
    savePendingSubmission(difficulty, { seed, moves, localTimeMs })
  }
}

// Retente les soumissions Legacy mises en attente faute de réseau (au plus
// une par difficulté, cf. legacyPendingSubmissions.js) — appelée au boot et
// au retour de connexion (cf. App.vue). Réutilise submitLegacyWin tel quel :
// son propre check GET /best gère naturellement la péremption (un meilleur
// score soumis entre-temps depuis un autre appareil fait sauter le retry).
// Séquentiel plutôt qu'en parallèle : au plus 3 entrées (une par difficulté),
// jamais sur le chemin d'une interaction joueur — pas besoin de vitesse, et
// ça évite tout chevauchement entre les tentatives.
export async function retryPendingLegacySubmissions() {
  for (const [difficulty, entry] of Object.entries(
    pendingLegacySubmissions.value,
  )) {
    if (entry) {
      await submitLegacyWin({ difficulty, ...entry })
    }
  }
}
