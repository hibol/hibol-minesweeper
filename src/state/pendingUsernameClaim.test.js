// @vitest-environment jsdom

import { describe, it, expect, beforeEach, vi } from "vitest"

// Même esprit que legacyPendingSubmissions.test.js : module chargé fraîchement
// à chaque test (ref(loadEntry()) à l'import), sanitize testé via l'état chargé.

const KEY = "hibol-minesweeper:pending-username-claim"

beforeEach(() => {
  localStorage.clear()
  vi.resetModules()
})

describe("pendingUsernameClaim — sanitizeEntry (via l'état chargé)", () => {
  it("charge une entrée valide", async () => {
    localStorage.setItem(KEY, JSON.stringify({ username: "testeuse" }))

    const { pendingUsernameClaim } = await import("./pendingUsernameClaim.js")

    expect(pendingUsernameClaim.value).toEqual({ username: "testeuse" })
  })

  it("filtre une entrée invalide (username absent/vide/non-string)", async () => {
    localStorage.setItem(KEY, JSON.stringify({ username: "" }))
    const { pendingUsernameClaim: empty } = await import(
      "./pendingUsernameClaim.js"
    )
    expect(empty.value).toBeNull()
  })

  it("localStorage vide/corrompu ⇒ rien en attente", async () => {
    localStorage.setItem(KEY, "{not json")

    const { pendingUsernameClaim } = await import("./pendingUsernameClaim.js")

    expect(pendingUsernameClaim.value).toBeNull()
  })
})

describe("pendingUsernameClaim — savePendingClaim", () => {
  it("enregistre le pseudo en attente et persiste", async () => {
    const { savePendingClaim, pendingUsernameClaim } = await import(
      "./pendingUsernameClaim.js"
    )

    savePendingClaim("player1234")

    expect(pendingUsernameClaim.value).toEqual({ username: "player1234" })
    expect(JSON.parse(localStorage.getItem(KEY))).toEqual({
      username: "player1234",
    })
  })

  it("un nouvel appel écrase l'attente précédente (un seul pseudo à la fois)", async () => {
    const { savePendingClaim, pendingUsernameClaim } = await import(
      "./pendingUsernameClaim.js"
    )

    savePendingClaim("first")
    savePendingClaim("second")

    expect(pendingUsernameClaim.value).toEqual({ username: "second" })
  })
})

describe("pendingUsernameClaim — clearPendingClaim", () => {
  it("efface l'attente et le localStorage", async () => {
    const { savePendingClaim, clearPendingClaim, pendingUsernameClaim } =
      await import("./pendingUsernameClaim.js")

    savePendingClaim("player1234")
    clearPendingClaim()

    expect(pendingUsernameClaim.value).toBeNull()
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it("rien en attente : no-op silencieux", async () => {
    const { clearPendingClaim, pendingUsernameClaim } = await import(
      "./pendingUsernameClaim.js"
    )

    clearPendingClaim()

    expect(pendingUsernameClaim.value).toBeNull()
  })
})
