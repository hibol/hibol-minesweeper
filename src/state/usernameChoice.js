import { ref, watch } from "vue"

// Le joueur doit choisir un nouveau pseudo : nom refusé en arrière-plan
// ("taken") ou compte supprimé du serveur ("account_gone"). Tant que c'est
// le cas, aucun envoi ne part : les runs attendent dans leurs files.
const KEY = "hibol-minesweeper:username-choice"
export { KEY as USERNAME_CHOICE_KEY }

const REASONS = ["taken", "account_gone"]

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY))
    if (!REASONS.includes(raw?.reason)) {
      return null
    }
    return {
      reason: raw.reason,
      rejectedName:
        typeof raw.rejectedName === "string" ? raw.rejectedName : "",
    }
  } catch {
    return null
  }
}

// Singleton réactif : App.vue ouvre le dialogue en le surveillant.
export const usernameChoice = ref(load())

export function requireUsernameChoice(reason, rejectedName) {
  usernameChoice.value = { reason, rejectedName }
}

export function clearUsernameChoice() {
  usernameChoice.value = null
}

watch(usernameChoice, (value) => {
  try {
    if (value) {
      localStorage.setItem(KEY, JSON.stringify(value))
    } else {
      localStorage.removeItem(KEY)
    }
  } catch {
    // indisponible : l'état en mémoire suffit pour la session
  }
})
