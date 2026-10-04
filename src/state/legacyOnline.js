import { playerId, onlineSuspended } from "./playerId"
import {
  pendingLegacySubmissions,
  savePendingSubmission,
  resolvePendingSubmission,
} from "./legacyPendingSubmissions"
import { applyServerBest, LEGACY_SCORE_DIFFICULTIES } from "./legacyScores"
import { sendClaimingUsername, USERNAME_NEEDED } from "./accountOnline"
import { usernameChoice } from "./usernameChoice"
import { getJson, postJson } from "./onlineApi"

const IDENTITY_REASONS = ["username_taken", USERNAME_NEEDED]

// Contrat vérifié dans temp/legacy-server-integration.md.

function postSubmission(body) {
  return postJson("/api/legacy/submissions", body)
}

// Classement en ligne d'une difficulté, déjà trié par timeMs croissant par
// le serveur (le rang, c'est l'index + 1, pas de champ `rank` par entrée).
// Lève en cas d'échec réseau/HTTP : à l'appelant de décider de l'affichage
// (cf. BurgerMenu.vue, page LEGACY TIMES).
export function fetchLegacyLeaderboard(difficulty, limit = 50) {
  return getJson(
    `/api/legacy/leaderboard?difficulty=${difficulty}&limit=${limit}`,
  )
}

// Meilleur temps déjà enregistré côté serveur pour ce playerId/difficulty —
// `null` si aucun score pour l'instant. Lève en cas d'échec réseau/HTTP :
// l'appelante (submitLegacyWin) décide quoi faire de cet échec, pas cette
// fonction (elle reste un simple GET, symétrique à fetchLegacyLeaderboard).
async function fetchServerBest(difficulty) {
  const { timeMs } = await getJson(
    `/api/legacy/players/${playerId}/best?difficulty=${difficulty}`,
  )
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
// avalée silencieusement, jamais remontée au joueur. Renvoie la réponse
// définitive du serveur ({ accepted, timeMs, rank, reason }), ou null si rien
// n'a été tranché (soumission sautée ou mise en attente).
export async function submitLegacyWin({
  difficulty,
  seed,
  moves,
  localTimeMs,
}) {
  if (onlineSuspended) {
    return null
  }

  // Pseudo à choisir : la run attend le nouveau nom, sans aucun envoi.
  if (usernameChoice.value) {
    savePendingSubmission(difficulty, { seed, moves, localTimeMs })
    return null
  }

  // Le check "vaut le coup ?" est volontairement hors du try/catch de la
  // soumission : un échec ici (réseau, timeout...) ne doit jamais empêcher
  // la vraie tentative de soumission qui suit, juste sauter l'optimisation.
  const serverBest = await fetchServerBest(difficulty).catch(() => null)

  if (serverBest !== null && localTimeMs >= serverBest + BEST_CHECK_MARGIN_MS) {
    // Le serveur a déjà au moins aussi bien : une éventuelle soumission en
    // attente de cette difficulté (cf. legacyPendingSubmissions.js) n'a plus
    // lieu d'être retentée SI elle n'était pas meilleure que cette run.
    resolvePendingSubmission(difficulty, localTimeMs)
    return null
  }

  try {
    // username_taken n'arrive qu'au 1er envoi de ce playerId : l'état « à
    // choisir » et la synchro du pseudo sont gérés par sendClaimingUsername.
    const result = await sendClaimingUsername((usernameToSend) =>
      postSubmission({
        playerId,
        username: usernameToSend,
        difficulty,
        seed,
        moves,
      }),
    )

    // Refus lié au pseudo, pas à la run : elle repartira sous le nouveau nom.
    if (IDENTITY_REASONS.includes(result.reason)) {
      savePendingSubmission(difficulty, { seed, moves, localTimeMs })
      return result
    }

    // Réponse définitive du serveur (acceptée ou non) pour cette run : idem
    // ci-dessus, plus la peine de retenter une soumission en attente qui
    // n'était pas meilleure.
    resolvePendingSubmission(difficulty, localTimeMs)
    return result
  } catch {
    // Hors ligne / serveur down / timeout : le joueur garde son score local,
    // juste pas de rang en ligne pour cette run MAINTENANT — on la garde en
    // attente (si elle est le meilleur échec connu pour cette difficulté)
    // pour la retenter plus tard (cf. retryPendingLegacySubmissions).
    savePendingSubmission(difficulty, { seed, moves, localTimeMs })
    return null
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
  // Pas de renvoi en boucle tant qu'aucun pseudo n'est choisi.
  if (usernameChoice.value) {
    return
  }

  for (const [difficulty, entry] of Object.entries(
    pendingLegacySubmissions.value,
  )) {
    if (entry) {
      await submitLegacyWin({ difficulty, ...entry })
    }
  }
}

// Rattrape l'affichage local (legacyScores.js) sur le classement serveur : le
// serveur est un cliquet (ne régresse jamais), donc s'il est meilleur que le
// meilleur temps local pour une difficulté, le local a pris du retard
// (restauration d'une sauvegarde ancienne, accident de stockage...) — jamais
// l'inverse (applyServerBest ne fait que lire le serveur). Volontairement PAS
// filtré aux difficultés ayant déjà un score local : réutilisée aussi juste
// après un lien d'appareil réussi (cf. BurgerMenu.vue), où le nouveau
// playerId peut avoir un meilleur temps serveur sur une difficulté jamais
// jouée sur CET appareil. Chaque difficulté est indépendante : un échec
// réseau sur l'une n'empêche jamais de vérifier les autres, ni ne remonte.
export async function reconcileLegacyScoresWithServer() {
  for (const difficulty of LEGACY_SCORE_DIFFICULTIES) {
    const serverBest = await fetchServerBest(difficulty).catch(() => null)

    if (serverBest !== null) {
      applyServerBest(difficulty, serverBest)
    }
  }
}
