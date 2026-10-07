// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest"
import { ref } from "vue"
import { usePendingStart } from "./usePendingStart"

function setup(game = {}) {
  const gameRef = ref({ mode: "classic", revealedCount: 0, ...game })
  const startNewGame = vi.fn()
  return {
    gameRef,
    startNewGame,
    ...usePendingStart(gameRef, { startNewGame }),
  }
}

beforeEach(() => {
  localStorage.clear()
})

describe("usePendingStart", () => {
  it("rien en attente au départ", () => {
    const { pendingStart, pendingDiscardMessage } = setup()

    expect(pendingStart.value).toBeNull()
    expect(pendingDiscardMessage.value).toBe("0 cells revealed will be lost")
  })

  it("ask met la demande en attente sans rien démarrer", () => {
    const { pendingStart, ask, startNewGame } = setup()

    ask("legacy", { difficulty: "expert" })

    expect(pendingStart.value).toEqual({
      mode: "legacy",
      params: { difficulty: "expert" },
    })
    expect(startNewGame).not.toHaveBeenCalled()
  })

  it("confirm lance la partie demandée, puis vide l'attente", () => {
    const { pendingStart, ask, confirm, startNewGame } = setup()
    ask("legacy", { difficulty: "expert" })

    confirm()

    expect(startNewGame).toHaveBeenCalledTimes(1)
    expect(startNewGame).toHaveBeenCalledWith("legacy", {
      difficulty: "expert",
    })
    expect(pendingStart.value).toBeNull()
  })

  it("cancel abandonne la demande sans rien démarrer", () => {
    const { pendingStart, ask, cancel, startNewGame } = setup()
    ask("classic", {})

    cancel()

    expect(pendingStart.value).toBeNull()
    expect(startNewGame).not.toHaveBeenCalled()
  })

  it("confirm sans demande en attente ne démarre rien", () => {
    const { confirm, startNewGame } = setup()

    confirm()

    expect(startNewGame).not.toHaveBeenCalled()
  })

  describe("message de perte", () => {
    it("même mode : compte les cases de la partie à l'écran", () => {
      const { ask, pendingDiscardMessage } = setup({
        mode: "classic",
        revealedCount: 12,
      })

      ask("classic", {})

      expect(pendingDiscardMessage.value).toBe("12 cells revealed will be lost")
    })

    it("infini : « explored » plutôt que « revealed »", () => {
      const { ask, pendingDiscardMessage } = setup({
        mode: "infinite",
        revealedCount: 100,
      })

      ask("infinite", {})

      expect(pendingDiscardMessage.value).toBe(
        "100 cells explored will be lost",
      )
    })

    it("autre mode : compte les cases du slot en pause", () => {
      localStorage.setItem(
        "hibol-minesweeper:active-game:infinite",
        JSON.stringify({ status: "playing", revealedCount: 250 }),
      )
      const { ask, pendingDiscardMessage } = setup({
        mode: "classic",
        revealedCount: 5,
      })

      ask("infinite", {})

      expect(pendingDiscardMessage.value).toBe(
        "250 cells explored will be lost",
      )
    })

    it("autre mode sans slot : zéro", () => {
      const { ask, pendingDiscardMessage } = setup({ mode: "classic" })

      ask("legacy", {})

      expect(pendingDiscardMessage.value).toBe("0 cells revealed will be lost")
    })

    it("suit la partie à l'écran tant que la demande est en attente", () => {
      const { gameRef, ask, pendingDiscardMessage } = setup({
        mode: "classic",
        revealedCount: 1,
      })
      ask("classic", {})

      gameRef.value.revealedCount = 9

      expect(pendingDiscardMessage.value).toBe("9 cells revealed will be lost")
    })
  })
})
