import { ref } from "vue"

// File d'attente pour la réclamation de pseudo ratée faute de réseau à
// l'onboarding (cf. UsernameDialog.vue / legacyOnline.js claimUsername) —
// mirror simplifié de legacyPendingSubmissions.js : pas de dimension "par
// difficulté" ici, une seule réclamation possible à la fois (le pseudo le
// plus récemment choisi écrase l'attente précédente, s'il y en avait une).
const KEY = "hibol-minesweeper:pending-username-claim"

function sanitizeEntry(raw) {
  if (!raw || typeof raw.username !== "string" || !raw.username) {
    return null
  }
  return { username: raw.username }
}

function loadEntry() {
  try {
    return sanitizeEntry(JSON.parse(localStorage.getItem(KEY)))
  } catch {
    // corrompu / indisponible : on repart sans réclamation en attente
    return null
  }
}

// Singleton réactif, même famille que legacyPendingSubmissions.js.
export const pendingUsernameClaim = ref(loadEntry())

function persist() {
  try {
    if (pendingUsernameClaim.value) {
      localStorage.setItem(KEY, JSON.stringify(pendingUsernameClaim.value))
    } else {
      localStorage.removeItem(KEY)
    }
  } catch {
    // plein / indisponible : la file en mémoire reste bonne pour la session
  }
}

export function savePendingClaim(username) {
  pendingUsernameClaim.value = { username }
  persist()
}

export function clearPendingClaim() {
  if (!pendingUsernameClaim.value) {
    return
  }

  pendingUsernameClaim.value = null
  persist()
}
