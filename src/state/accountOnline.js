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
import {
  usernameChoice,
  requireUsernameChoice,
  clearUsernameChoice,
} from "./usernameChoice"
import { pushToast } from "./toastQueue"
import { getJson, postJson, deleteRequest } from "./onlineApi"

// Aligne le pseudo local sur celui que le serveur a enregistré pour ce
// playerId (renommage admin). Seul point qui annonce un changement de nom :
// un nom déjà à jour ne produit jamais de 2e toast. `announce: false` quand
// l'écran affiche déjà le nom (dialogue de pseudo, pairage).
export function syncUsernameFromServer(
  serverUsername,
  { announce = true } = {},
) {
  if (!serverUsername || serverUsername === username.value) {
    return
  }

  setServerUsername(serverUsername)
  if (announce) {
    pushToast(`Your online name is now "${serverUsername}".`, {
      durationMs: 6000,
    })
  }
}

// Une seule réclamation en vol : chaque envoi attend la fin du précédent, sinon
// deux envois du démarrage pourraient réclamer en même temps. `signal` permet
// au dialogue de ne pas attendre indéfiniment derrière un envoi de fond.
let claimChain = Promise.resolve()

function withClaimLock(task, signal) {
  const run = claimChain.then(() => {
    signal?.throwIfAborted()
    return task()
  })
  claimChain = run.catch(() => {})

  if (!signal) {
    return run
  }
  const aborted = new Promise((_, reject) => {
    signal.addEventListener("abort", () => reject(signal.reason), {
      once: true,
    })
  })
  return Promise.race([run, aborted])
}

// Réponse locale : un pseudo est à choisir, rien n'a été envoyé.
export const USERNAME_NEEDED = "username_needed"

// Seul chemin de réclamation (/claim ou soumission d'un mode). Sans
// `chosenName`, c'est un envoi de fond : sur username_taken, aucun autre nom
// n'est tenté, le joueur devra en choisir un (cf. usernameChoice.js). Lève sur
// panne, comme postJson.
async function sendClaiming(send, { chosenName, signal } = {}) {
  return withClaimLock(async () => {
    const background = chosenName === undefined
    if (background && usernameChoice.value) {
      return { accepted: false, reason: USERNAME_NEEDED }
    }

    const name =
      chosenName ??
      (pendingUsernameClaim.value?.username ||
        username.value ||
        generateRandomUsername())
    const result = await send(name)

    if (result.reason === "username_taken") {
      if (background) {
        // Rien n'a été créé pour ce playerId : la réclamation en attente est
        // caduque, le dialogue la remplacera.
        clearPendingClaim()
        requireUsernameChoice("taken", name)
      }
    } else {
      syncUsernameFromServer(result.username, { announce: background })
    }
    return result
  }, signal)
}

// Envoi de fond d'un mode (legacyOnline.js, infiniteOnline.js). Renvoie
// `{ reason: USERNAME_NEEDED }` sans rien envoyer tant qu'un pseudo est à choisir.
export function sendClaimingUsername(send) {
  return sendClaiming(send)
}

function postUsernameClaim(usernameToClaim, options) {
  return postJson(
    "/api/legacy/players/claim",
    { playerId, username: usernameToClaim },
    options,
  )
}

// Borne l'appel bloquant du dialogue de pseudo : au-delà, on laisse le joueur
// continuer plutôt que le faire attendre.
const USERNAME_CLAIM_TIMEOUT_MS = 4000

// Réclame le pseudo saisi dans le dialogue (onboarding ou nouveau choix).
// Ne lève jamais : réseau down/timeout -> mis en attente (cf.
// pendingUsernameClaim.js) et renvoie `null`. `username_taken`/
// `invalid_username` sont renvoyés tels quels, l'erreur s'affiche dans le
// dialogue. Dans les deux autres cas, le choix est fait : l'état « à choisir »
// est effacé.
export async function claimUsername(usernameToClaim) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), USERNAME_CLAIM_TIMEOUT_MS)

  try {
    const result = await sendClaiming(
      (name) => postUsernameClaim(name, { signal: controller.signal }),
      { chosenName: usernameToClaim, signal: controller.signal },
    )
    if (!result.reason) {
      clearPendingClaim()
      clearUsernameChoice()
    }
    return result
  } catch {
    setUsername(usernameToClaim)
    savePendingClaim(usernameToClaim)
    clearUsernameChoice()
    return null
  } finally {
    clearTimeout(timer)
  }
}

// Retente la réclamation mise en attente faute de réseau (au plus une, cf.
// pendingUsernameClaim.js), au boot et au retour de connexion (cf. App.vue).
// Pas de timeout : appel de fond, jamais sur le chemin d'une interaction.
export async function retryPendingUsernameClaim() {
  if (!pendingUsernameClaim.value) {
    return
  }

  let result
  try {
    result = await sendClaimingUsername(postUsernameClaim)
  } catch {
    // Toujours pas de réseau : reste en attente pour la prochaine tentative.
    return
  }

  if (!result.reason) {
    clearPendingClaim()
  }
}

const USERNAME_REFRESH_TIMEOUT_MS = 5000

// 404 sur un appareil qui a un pseudo, rien en attente et rien à choisir : le
// compte a existé puis a été supprimé (admin). Un onboarding hors ligne garde
// une réclamation en attente ; une suppression par le joueur vide le pseudo.
function accountWentMissing() {
  return (
    !!username.value && !pendingUsernameClaim.value && !usernameChoice.value
  )
}

// Relit le pseudo canonique (renommage admin) sans rien soumettre. Lecture
// seule, jamais de /claim : ça recréerait un compte supprimé. Un 404 sur un
// compte disparu demande un nouveau pseudo ; route absente, panne : ignorés.
export async function refreshUsernameFromServer() {
  if (onlineSuspended) {
    return
  }

  // Les fusions d'identité attendent cette lecture au boot (cf. App.vue) : un
  // réseau qui ne répond plus ne doit pas les bloquer.
  const controller = new AbortController()
  const timer = setTimeout(
    () => controller.abort(),
    USERNAME_REFRESH_TIMEOUT_MS,
  )
  const requestedPlayerId = playerId
  let result
  let missing = false
  try {
    result = await getJson(`/api/legacy/players/${requestedPlayerId}`, {
      signal: controller.signal,
    })
  } catch (error) {
    missing = error?.status === 404
  } finally {
    clearTimeout(timer)
  }

  // Compte supprimé ou appareil lié pendant la requête : réponse périmée.
  if (onlineSuspended || playerId !== requestedPlayerId) {
    return
  }
  if (missing) {
    if (accountWentMissing()) {
      requireUsernameChoice("account_gone", username.value)
    }
    return
  }
  syncUsernameFromServer(result?.username)
}

// Boot et retour du réseau (cf. App.vue) : la réclamation en attente passe
// d'abord, pour que la lecture voie le nom qu'elle a figé.
export async function retryClaimThenRefreshUsername() {
  await retryPendingUsernameClaim()
  await refreshUsernameFromServer()
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
// mode sur ce nouveau playerId revient à l'appelant (cf. useDeviceLink.js).
// Contrat serveur réel (PlayerController) : pas de champ `accepted` — succès =
// `reason` absent/null, `{ reason: "code_invalid" | "code_expired" }` sinon,
// sans aucun changement d'état.
export async function completeDeviceLink(code) {
  const result = await linkDevice(code)

  if (!result.reason) {
    const previousPlayerId = playerId
    setPlayerId(result.playerId)
    // L'écran de pairage annonce déjà le nom adopté : pas de toast.
    syncUsernameFromServer(result.username, { announce: false })
    // L'appareil adopte un compte existant : plus de pseudo à choisir.
    clearUsernameChoice()
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
  clearUsernameChoice()
  for (const difficulty of LEGACY_SCORE_DIFFICULTIES) {
    clearPendingSubmission(difficulty)
  }
  clearPendingInfiniteRuns()
  clearPendingIdentityMerges()
}
