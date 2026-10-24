import { retryPendingLegacySubmissions } from "./legacyOnline"
import {
  retryClaimThenRefreshUsername,
  retryPendingIdentityMerges,
} from "./accountOnline"
import { retryPendingInfiniteRuns } from "./infiniteOnline"

// Renvois en attente, l'un après l'autre : la réclamation de pseudo passe
// d'abord (suivie d'une relecture du nom, pour un renommage ou un compte
// supprimé par l'admin), puis les fusions d'identité (une sauvegarde importée
// peut apporter une identité pas encore créée), puis les runs de chaque mode.
async function runQueues() {
  await retryClaimThenRefreshUsername()
  await retryPendingIdentityMerges()
  await retryPendingLegacySubmissions()
  await retryPendingInfiniteRuns()
}

// Boot, événement `online` et validation du pseudo peuvent tomber ensemble :
// un seul passage à la fois, sinon une même victoire Legacy partirait deux fois
// (deux rejeux serveur). Un appel pendant un passage en demande un 2e juste
// après (le pseudo ou le réseau a changé entre-temps), jamais en parallèle.
let running = null
let again = false

export function retryOnlineQueues() {
  if (running) {
    again = true
    return running
  }

  running = (async () => {
    try {
      do {
        again = false
        await runQueues()
      } while (again)
    } finally {
      running = null
    }
  })()
  return running
}
