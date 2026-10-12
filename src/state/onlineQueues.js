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
export async function retryOnlineQueues() {
  await retryClaimThenRefreshUsername()
  await retryPendingIdentityMerges()
  await retryPendingLegacySubmissions()
  await retryPendingInfiniteRuns()
}
