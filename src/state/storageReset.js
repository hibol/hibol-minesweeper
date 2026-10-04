import { PLAYER_ID_KEY } from "./playerId"
import { USERNAME_KEY, USERNAME_PROMPTED_KEY } from "./username"
import { PENDING_USERNAME_CLAIM_KEY } from "./pendingUsernameClaim"
import { USERNAME_CHOICE_KEY } from "./usernameChoice"
import { PENDING_IDENTITY_MERGES_KEY } from "./pendingIdentityMerges"
import { LEGACY_PENDING_SUBMISSIONS_KEY } from "./legacyPendingSubmissions"
import { INFINITE_PENDING_SUBMISSIONS_KEY } from "./infinitePendingSubmissions"

// Toutes les clés du jeu partagent ce préfixe (reset, import, export).
export const STORAGE_PREFIX = "hibol-minesweeper:"

// L'identité en ligne de l'appareil et ses envois en attente : sans elles,
// l'appareil ne peut plus désigner son compte, qui resterait orphelin.
const ONLINE_ACCOUNT_KEYS = [
  PLAYER_ID_KEY,
  USERNAME_KEY,
  USERNAME_PROMPTED_KEY,
  PENDING_USERNAME_CLAIM_KEY,
  USERNAME_CHOICE_KEY,
  PENDING_IDENTITY_MERGES_KEY,
  LEGACY_PENDING_SUBMISSIONS_KEY,
  INFINITE_PENDING_SUBMISSIONS_KEY,
]

// Efface les clés du jeu, sauf le compte en ligne si demandé (« Reset
// everything » sans suppression du compte, cf. menu/SettingsPage.vue).
export function clearGameStorage({ keepOnlineAccount = false } = {}) {
  for (const key of Object.keys(localStorage)) {
    if (
      key.startsWith(STORAGE_PREFIX) &&
      !(keepOnlineAccount && ONLINE_ACCOUNT_KEYS.includes(key))
    ) {
      localStorage.removeItem(key)
    }
  }
}
