import { ref, computed } from "vue"

// Classement en ligne d'une page du menu : une liste et un statut par clé
// (difficulté Legacy, ou métrique × catégorie Infini), jamais mélangés.
// `currentKey` : ref/computed de la clé affichée. `fetchList(key)` : promesse
// de la liste, rejetée en cas d'échec réseau.
export function useLeaderboard(currentKey, fetchList) {
  const lists = ref({})
  const statuses = ref({}) // clé -> "loading" | "loaded" | "error"

  const list = computed(() => lists.value[currentKey.value] ?? [])
  const status = computed(() => statuses.value[currentKey.value] ?? "idle")

  // Lignes à réserver : la plus longue des listes déjà chargées, pour que le
  // panneau garde sa taille d'une clé à l'autre (les autres sont inconnues).
  const maxCount = computed(() =>
    Math.max(0, ...Object.values(lists.value).map((l) => l.length)),
  )

  async function load() {
    const key = currentKey.value
    statuses.value[key] = "loading"

    try {
      lists.value[key] = await fetchList(key)
      statuses.value[key] = "loaded"
    } catch {
      statuses.value[key] = "error"
    }
  }

  return { list, status, maxCount, load }
}
