// Identité en ligne, commune à tous les modes : réclamation du pseudo,
// pairage d'appareil, suppression du compte. Ne dépend d'aucun module de mode
// (legacyOnline.js, infiniteOnline.js) : c'est l'inverse.
import {
  playerId,
  setPlayerId,
  onlineSuspended,
  suspendOnline,
} from "./playerId"
import {
  username,
  generateRandomUsername,
  setUsername,
  setServerUsername,
  resetUsernamePrompt,
} from "./username"
import {
  pendingUsernameClaim,
  savePendingClaim,
  clearPendingClaim,
} from "./pendingUsernameClaim"
import { clearPendingSubmission } from "./legacyPendingSubmissions"
import { clearPendingInfiniteRuns } from "./infinitePendingSubmissions"
import {
  pendingIdentityMerges,
  queueIdentityMerge,
  resolveIdentityMerge,
  clearPendingIdentityMerges,
} from "./pendingIdentityMerges"
import { LEGACY_SCORE_DIFFICULTIES } from "./legacyScores"
import { pushToast } from "./toastQueue"
import { postJson, deleteRequest } from "./onlineApi"

const USERNAME_NOTICES = {
  renamed: (name) => `Your online name is now "${name}".`,
  taken: (name) =>
    `Your name was already taken online — you're "${name}" there instead. If that's your own account, link this device in Settings → Account.`,
}

// Aligne le pseudo local sur celui que le serveur a enregistré pour ce
// playerId (renommage admin, repli aléatoire). Seul point qui annonce un
// changement de nom : un nom déjà à jour ne produit jamais de 2e toast.
// `notice: null` quand l'écran affiche déjà le nom (onboarding, pairage).
export function syncUsernameFromServer(
  serverUsername,
  { notice = "renamed" } = {},
) {
  if (!serverUsername || serverUsername === username.value) {
    return
  }

  setServerUsername(serverUsername)
  if (notice) {
    pushToast(USERNAME_NOTICES[notice](serverUsername), { durationMs: 6000 })
  }
}

// Envoi qui réclame le pseudo au passage (/claim ou soumission d'un mode). Sur
// username_taken, un seul nouvel essai avec un pseudo tiré au sort, puis
// synchronisation. Lève sur panne, comme postJson.
export async function sendClaimingUsername(
  send,
  firstUsername = username.value || generateRandomUsername(),
) {
  let result = await send(firstUsername)
  if (result.reason !== "username_taken") {
    syncUsernameFromServer(result.username)
    return result
  }

  const fallbackUsername = generateRandomUsername()
  result = await send(fallbackUsername)
  if (result.reason !== "username_taken") {
    // Serveur sans champ `username` : il réclame le pseudo avant de juger la
    // run, le repli est donc acquis même si elle est refusée.
    syncUsernameFromServer(result.username ?? fallbackUsername, {
      notice: "taken",
    })
  }
  return result
}

function postUsernameClaim(usernameToClaim, options) {
  return postJson(
    "/api/legacy/players/claim",
    { playerId, username: usernameToClaim },
    options,
  )
}

// Borne l'appel bloquant de l'onboarding (cf. UsernameDialog.vue) : au-delà,
// on préfère laisser le joueur continuer plutôt que le faire attendre.
const USERNAME_CLAIM_TIMEOUT_MS = 4000

// Réclame le pseudo choisi à l'onboarding, avant même la 1re partie —
// remplace l'ancien chemin où le pseudo ne se figeait qu'à la 1re victoire
// Legacy soumise (submitLegacyWin réclame toujours implicitement à son 1er
// essai, ce qui reste un filet si cet appel-ci échoue, cf. legacyOnline.js).
// Ne lève jamais : réseau down/timeout -> mis en attente (cf.
// pendingUsernameClaim.js) et renvoie `null`. `username_taken`/
// `invalid_username` sont des réponses définitives du serveur, pas une
// erreur réseau : renvoyées telles quelles, jamais mises en attente.
// Enregistre le pseudo local dans les deux autres cas : celui du serveur s'il
// a répondu, sinon celui choisi (l'onboarding continue hors ligne).
export async function claimUsername(usernameToClaim) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), USERNAME_CLAIM_TIMEOUT_MS)

  try {
    const result = await postUsernameClaim(usernameToClaim, {
      signal: controller.signal,
    })
    if (!result.reason) {
      // L'écran d'accueil affiche déjà le nom : pas de toast.
      syncUsernameFromServer(result.username, { notice: null })
    }
    return result
  } catch {
    setUsername(usernameToClaim)
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
// sur le chemin d'une interaction joueur. Même repli aléatoire que les
// soumissions sur username_taken (cf. sendClaimingUsername).
export async function retryPendingUsernameClaim() {
  const pending = pendingUsernameClaim.value
  if (!pending) {
    return
  }

  let result
  try {
    result = await sendClaimingUsername(postUsernameClaim, pending.username)
  } catch {
    // Toujours pas de réseau : reste en attente pour la prochaine tentative.
    return
  }

  if (!result.reason) {
    clearPendingClaim()
  }
}

// Génère un code de liaison à 6 chiffres pour CE playerId (l'appareil source,
// celui qui a déjà des runs) — l'appareil qui REJOINT le saisit ensuite (cf.
// linkDevice/completeDeviceLink). `{ reason: "unknown_player" }` (pas de champ
// `accepted` — contrat PlayerController réel) si ce playerId est inconnu du
// serveur : pseudo pas encore réclamé (onboarding hors ligne).
export function requestLinkCode() {
  return postJson(`/api/legacy/players/${playerId}/link-codes`)
}

// Consomme un code de liaison depuis l'appareil qui REJOINT. Ne touche à rien
// en cas de succès (cf. completeDeviceLink pour l'écriture locale) — cette
// fonction reste un simple appel réseau, symétrique à requestLinkCode.
function linkDevice(code) {
  return postJson("/api/legacy/players/link", { code })
}

// Consomme un code de liaison et, en cas de succès, remplace l'identité en
// ligne de CET appareil — playerId + username UNIQUEMENT, jamais
// achievements/shop/runHistory/treasureLog (l'historique local de l'appareil
// n'a aucun rapport avec l'identité en ligne). Rattraper les scores de chaque
// mode sur ce nouveau playerId revient à l'appelant (cf. BurgerMenu.vue).
// Contrat serveur réel (PlayerController) : pas de champ `accepted` — succès =
// `reason` absent/null, `{ reason: "code_invalid" | "code_expired" }` sinon,
// sans aucun changement d'état.
export async function completeDeviceLink(code) {
  const result = await linkDevice(code)

  if (!result.reason) {
    const previousPlayerId = playerId
    setPlayerId(result.playerId)
    // L'écran de pairage annonce déjà le nom adopté : pas de toast.
    syncUsernameFromServer(result.username, { notice: null })
    // L'ancienne identité de CET appareil rejoint celle qu'il adopte, au lieu
    // de rester orpheline sur le serveur.
    queueIdentityMerge(previousPlayerId, result.playerId)
    await retryPendingIdentityMerges()
  }

  return result
}

// Envoie les fusions d'identité en attente, dans l'ordre (cf.
// pendingIdentityMerges.js) : après un pairage, au boot et au retour de
// connexion (cf. App.vue). S'arrête à la 1re panne. Toute réponse du serveur
// est définitive : fusion faite, déjà faite (idempotent) ou cible inconnue.
export async function retryPendingIdentityMerges() {
  if (onlineSuspended) {
    return
  }

  while (pendingIdentityMerges.value.length > 0) {
    const merge = pendingIdentityMerges.value[0]
    try {
      await postJson("/api/legacy/players/merge", {
        fromPlayerId: merge.from,
        toPlayerId: merge.to,
      })
    } catch {
      return
    }
    resolveIdentityMerge(merge)
  }
}

// Suppression du compte en ligne (exigence Play, bouton dans About) : le
// serveur efface le joueur et tous ses scores, puis CET appareil repart d'une
// identité vierge — nouveau playerId, pseudo et files d'attente vidés (sinon
// une soumission en attente recréerait le compte). Le dialogue de pseudo
// revient au prochain lancement ; d'ici là, plus aucun envoi. Les données
// locales (temps, runs, achievements) ne bougent pas. Lève si le serveur n'a
// pas confirmé : rien n'est touché localement dans ce cas.
export async function deleteOnlineAccount() {
  await deleteRequest(`/api/legacy/players/${playerId}`)

  suspendOnline()
  setPlayerId(crypto.randomUUID())
  setUsername("")
  resetUsernamePrompt()
  clearPendingClaim()
  for (const difficulty of LEGACY_SCORE_DIFFICULTIES) {
    clearPendingSubmission(difficulty)
  }
  clearPendingInfiniteRuns()
  clearPendingIdentityMerges()
}
