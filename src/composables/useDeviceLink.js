import { ref } from "vue"
import { completeDeviceLink } from "../state/accountOnline"
import { reconcileLegacyScoresWithServer } from "../state/legacyOnline"

// Saisie d'un code de pairage, partagée par Settings → Account
// (BurgerMenu.vue) et l'onboarding (UsernameDialog.vue). Chaque appel a son
// propre état. Renvoie des refs : déstructurer le résultat garde la réactivité.
export function useDeviceLink() {
  const code = ref("")
  const status = ref("idle") // idle | loading | success | error
  const error = ref("")
  const linkedUsername = ref("")

  async function submit() {
    if (status.value === "loading") {
      return
    }

    status.value = "loading"
    error.value = ""

    try {
      const result = await completeDeviceLink(code.value.trim())

      if (result.reason) {
        error.value =
          result.reason === "code_expired"
            ? "This code has expired — get a new one from the other device."
            : "Invalid code."
        status.value = "error"
        return
      }

      // Nouveau playerId : rattrape ses meilleurs temps Legacy du serveur.
      await reconcileLegacyScoresWithServer()
      linkedUsername.value = result.username
      code.value = ""
      status.value = "success"
    } catch (e) {
      // 429 : limite anti force brute du serveur (10 essais / 10 min par IP).
      error.value =
        e?.status === 429
          ? "Too many attempts. Wait a few minutes and try again."
          : "Couldn't reach the server. Try again."
      status.value = "error"
    }
  }

  return { code, status, error, linkedUsername, submit }
}
