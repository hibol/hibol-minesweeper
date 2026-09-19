import { ref } from "vue"
import { playerId } from "./playerId"
import { username, generateRandomUsername } from "./username"

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

// Soumet une victoire Legacy pour le classement en ligne. Le score local
// (legacyScores.js) est déjà acquis indépendamment de cet appel : toute
// erreur réseau (offline, serveur down, timeout, réponse non-JSON) est
// avalée silencieusement, jamais remontée au joueur.
export async function submitLegacyWin({ difficulty, seed, moves }) {
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
  } catch {
    // rien à faire : le joueur garde son score local, juste pas de rang en
    // ligne pour cette run.
  }
}
