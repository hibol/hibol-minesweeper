import { describe, it, expect, vi } from "vitest"
import { ref } from "vue"
import { useLeaderboard } from "./useLeaderboard"

describe("useLeaderboard", () => {
  it("idle tant que rien n'est chargé, liste vide", () => {
    const { list, status, maxCount } = useLeaderboard(ref("a"), vi.fn())

    expect(status.value).toBe("idle")
    expect(list.value).toEqual([])
    expect(maxCount.value).toBe(0)
  })

  it("loading pendant l'appel, puis loaded avec la liste de la clé", async () => {
    let resolve
    const fetchList = vi.fn(() => new Promise((r) => (resolve = r)))
    const { list, status, load } = useLeaderboard(ref("beginner"), fetchList)

    const pending = load()
    expect(fetchList).toHaveBeenCalledWith("beginner")
    expect(status.value).toBe("loading")

    resolve([{ username: "alice" }])
    await pending
    expect(status.value).toBe("loaded")
    expect(list.value).toEqual([{ username: "alice" }])
  })

  it("échec : statut error, aucune exception", async () => {
    const { status, load } = useLeaderboard(ref("a"), () =>
      Promise.reject(new Error("offline")),
    )

    await load()

    expect(status.value).toBe("error")
  })

  it("une liste par clé : changer de clé affiche la sienne, sans mélange", async () => {
    const key = ref("a")
    const { list, status, load } = useLeaderboard(key, (k) =>
      Promise.resolve([k]),
    )

    await load()
    key.value = "b"
    expect(status.value).toBe("idle")
    expect(list.value).toEqual([])

    await load()
    expect(list.value).toEqual(["b"])
    key.value = "a"
    expect(list.value).toEqual(["a"])
  })

  it("une réponse tardive range sa liste sous la clé de départ", async () => {
    const key = ref("a")
    let resolve
    const { list, load } = useLeaderboard(
      key,
      () => new Promise((r) => (resolve = r)),
    )

    const pending = load()
    key.value = "b"
    resolve(["pour a"])
    await pending

    expect(list.value).toEqual([])
    key.value = "a"
    expect(list.value).toEqual(["pour a"])
  })

  it("maxCount : la plus longue des listes chargées", async () => {
    const key = ref("a")
    const lengths = { a: 3, b: 5, c: 1 }
    const { maxCount, load } = useLeaderboard(key, (k) =>
      Promise.resolve(Array(lengths[k]).fill({})),
    )

    for (const k of ["a", "b", "c"]) {
      key.value = k
      await load()
    }

    expect(maxCount.value).toBe(5)
  })
})
