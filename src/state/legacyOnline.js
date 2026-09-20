import { ref } from "vue"
import { playerId, setPlayerId } from "./playerId"
import { username, generateRandomUsername, setUsername } from "./username"
import {
  pendingLegacySubmissions,
  savePendingSubmission,
  resolvePendingSubmission,
} from "./legacyPendingSubmissions"
import {
  pendingUsernameClaim,
  savePendingClaim,
  clearPendingClaim,
} from "./pendingUsernameClaim"
import { applyServerBest, LEGACY_SCORE_DIFFICULTIES } from "./legacyScores"
import { pushToast } from "./toastQueue"

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

  // Même garde-fou que fetchLegacyLeaderboard/fetchServerBest : un statut non-2xx
  // (429, 500...) peut avoir un corps JSON parseable, il ne doit pas être pris
  // pour une réponse définitive par submitLegacyWin (son catch gère déjà la file
  // d'attente pour une erreur réseau).
  if (!response.ok) {
    throw new Error(`submission failed: ${response.status}`)
  }

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

// Toast de renommage silencieux, partagé entre submitLegacyWin (username_taken
// à la soumission) et retryPendingUsernameClaim (username_taken à la
// réclamation d'onboarding en attente) — même cause, même explication, seule
// l'action varie ("this run was saved as" vs "claimed").
function pushUsernameTakenToast(action, fallbackUsername) {
  pushToast(
    `Your name was already taken online — ${action} "${fallbackUsername}" instead. If that's your own account, link this device in Settings → Account.`,
    { durationMs: 6000 },
  )
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
    // un nouveau pseudo tiré au sort suffit. Le renommage est sinon invisible :
    // username.value (affiché partout dans l'UI) ne change pas, seul le
    // pseudo envoyé au serveur diffère — d'où le toast, pour que le joueur
    // sache sous quel nom sa run vient d'être enregistrée en ligne.
    if (result.reason === "username_taken") {
      const fallbackUsername = generateRandomUsername()
      result = await postSubmission({
        playerId,
        username: fallbackUsername,
        difficulty,
        seed,
        moves,
      })
      pushUsernameTakenToast("this run was saved as", fallbackUsername)
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

async function postUsernameClaim(usernameToClaim, { signal } = {}) {
  const response = await fetch(`${API_BASE}/api/legacy/players/claim`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ playerId, username: usernameToClaim }),
    signal,
  })

  if (!response.ok) {
    throw new Error(`claim failed: ${response.status}`)
  }

  return response.json()
}

// Borne l'appel bloquant de l'onboarding (cf. UsernameDialog.vue) : au-delà,
// on préfère laisser le joueur continuer plutôt que le faire attendre.
const USERNAME_CLAIM_TIMEOUT_MS = 4000

// Réclame le pseudo choisi à l'onboarding, avant même la 1re partie —
// remplace l'ancien chemin où le pseudo ne se figeait qu'à la 1re victoire
// Legacy soumise (submitLegacyWin réclame toujours implicitement à son 1er
// essai, ce qui reste un filet si cet appel-ci échoue, cf. plus haut). Ne
// lève jamais : réseau down/timeout -> mis en attente (cf.
// pendingUsernameClaim.js) et renvoie `null`, à charge de l'appelant de
// continuer l'onboarding avec le nom choisi localement. `username_taken`/
// `invalid_username` sont des réponses définitives du serveur, pas une
// erreur réseau : renvoyées telles quelles, jamais mises en attente.
export async function claimUsername(usernameToClaim) {
  const controller = new AbortController()
  const timer = setTimeout(
    () => controller.abort(),
    USERNAME_CLAIM_TIMEOUT_MS,
  )

  try {
    return await postUsernameClaim(usernameToClaim, {
      signal: controller.signal,
    })
  } catch {
    savePendingClaim(usernameToClaim)
    return null
  } finally {
    clearTimeout(timer)
  }
}

// Retente la réclamation de pseudo mise en attente faute de réseau à
// l'onboarding (au plus une, cf. pendingUsernameClaim.js) — appelée au boot
// et au retour de connexion (cf. App.vue), même câblage que
// retryPendingLegacySubmissions. Pas de timeout ici : appel de fond, jamais
// sur le chemin d'une interaction joueur.
export async function retryPendingUsernameClaim() {
  const pending = pendingUsernameClaim.value
  if (!pending) {
    return
  }

  let result
  try {
    result = await postUsernameClaim(pending.username)
  } catch {
    // Toujours pas de réseau : reste en attente pour la prochaine tentative.
    return
  }

  if (result.reason === "username_taken") {
    // Même geste que submitLegacyWin sur username_taken : un seul retry avec
    // un nouveau pseudo tiré au sort, annoncé par toast.
    const fallbackUsername = generateRandomUsername()
    try {
      result = await postUsernameClaim(fallbackUsername)
    } catch {
      return
    }
    if (!result.reason) {
      pushUsernameTakenToast("claimed", fallbackUsername)
    }
  }

  if (!result.reason) {
    clearPendingClaim()
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

// Génère un code de liaison à 6 chiffres pour CE playerId (l'appareil source,
// celui qui a déjà des runs) — l'appareil qui REJOINT le saisit ensuite (cf.
// linkDevice/completeDeviceLink). `{ reason: "unknown_player" }` (pas de champ
// `accepted` — contrat PlayerController réel) si ce playerId n'a jamais
// soumis de run Legacy : rien à lier depuis un appareil qui n'a joué aucune
// partie.
export async function requestLinkCode() {
  const response = await fetch(
    `${API_BASE}/api/legacy/players/${playerId}/link-codes`,
    { method: "POST" },
  )

  if (!response.ok) {
    throw new Error(`link code request failed: ${response.status}`)
  }

  return response.json()
}

// Consomme un code de liaison depuis l'appareil qui REJOINT. Ne touche à rien
// en cas de succès (cf. completeDeviceLink pour l'écriture locale) — cette
// fonction reste un simple appel réseau, symétrique à requestLinkCode.
async function linkDevice(code) {
  const response = await fetch(`${API_BASE}/api/legacy/players/link`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  })

  if (!response.ok) {
    throw new Error(`link failed: ${response.status}`)
  }

  return response.json()
}

// Consomme un code de liaison et, en cas de succès, remplace l'identité en
// ligne de CET appareil — playerId + username UNIQUEMENT, jamais
// achievements/shop/runHistory/treasureLog (l'historique local de l'appareil
// n'a aucun rapport avec l'identité en ligne) — puis rattrape l'affichage des
// scores Legacy sur ce nouveau playerId (cf. reconcileLegacyScoresWithServer).
// Contrat serveur réel (PlayerController) : pas de champ `accepted` — succès =
// `reason` absent/null, `{ reason: "code_invalid" | "code_expired" }` sinon,
// sans aucun changement d'état.
export async function completeDeviceLink(code) {
  const result = await linkDevice(code)

  if (!result.reason) {
    setPlayerId(result.playerId)
    setUsername(result.username)
    await reconcileLegacyScoresWithServer()
  }

  return result
}
