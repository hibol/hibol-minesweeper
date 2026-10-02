import { describe, it, expect, beforeEach, vi } from "vitest"

const completeDeviceLink = vi.fn()
vi.mock("../state/accountOnline", () => ({
  completeDeviceLink: (...args) => completeDeviceLink(...args),
}))

const reconcileLegacyScoresWithServer = vi.fn()
vi.mock("../state/legacyOnline", () => ({
  reconcileLegacyScoresWithServer: (...args) =>
    reconcileLegacyScoresWithServer(...args),
}))

const { useDeviceLink } = await import("./useDeviceLink.js")

beforeEach(() => {
  completeDeviceLink.mockReset()
  reconcileLegacyScoresWithServer.mockReset()
})

describe("useDeviceLink", () => {
  it("succès : code trimé, scores Legacy rattrapés, champ vidé", async () => {
    completeDeviceLink.mockResolvedValue({
      playerId: "id",
      username: "alice",
      reason: null,
    })
    const link = useDeviceLink()
    link.code.value = " 123456 "

    await link.submit()

    expect(completeDeviceLink).toHaveBeenCalledWith("123456")
    expect(reconcileLegacyScoresWithServer).toHaveBeenCalledTimes(1)
    expect(link.status.value).toBe("success")
    expect(link.linkedUsername.value).toBe("alice")
    expect(link.code.value).toBe("")
  })

  it.each([
    ["code_expired", "This code has expired"],
    ["code_invalid", "Invalid code."],
  ])("refus %s : message dédié, pas de rattrapage", async (reason, text) => {
    completeDeviceLink.mockResolvedValue({ reason })
    const link = useDeviceLink()

    await link.submit()

    expect(link.status.value).toBe("error")
    expect(link.error.value).toContain(text)
    expect(reconcileLegacyScoresWithServer).not.toHaveBeenCalled()
  })

  it("panne réseau : message dédié", async () => {
    completeDeviceLink.mockRejectedValue(new Error("offline"))
    const link = useDeviceLink()

    await link.submit()

    expect(link.status.value).toBe("error")
    expect(link.error.value).toContain("Couldn't reach the server")
  })

  it("429 du serveur : message dédié, pas « serveur injoignable »", async () => {
    completeDeviceLink.mockRejectedValue(
      Object.assign(new Error("POST failed: 429"), { status: 429 }),
    )
    const link = useDeviceLink()

    await link.submit()

    expect(link.error.value).toContain("Too many attempts")
  })

  it("double envoi pendant le chargement : ignoré", async () => {
    let resolve
    completeDeviceLink.mockReturnValue(new Promise((r) => (resolve = r)))
    const link = useDeviceLink()

    const first = link.submit()
    await link.submit()
    resolve({ username: "alice", reason: null })
    await first

    expect(completeDeviceLink).toHaveBeenCalledTimes(1)
  })

  it("chaque appel a son propre état", () => {
    const a = useDeviceLink()
    const b = useDeviceLink()
    a.code.value = "111111"

    expect(b.code.value).toBe("")
  })
})
