// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest"
import { ref } from "vue"
import { usePausedModes } from "./usePausedModes"
import { MAX_OPENING_REVEAL } from "../game/game"

const slot = (mode) => `hibol-minesweeper:active-game:${mode}`

// peekActiveGame ne lit que le statut et le nombre de cases du slot.
function pause(mode, revealedCount, status = "playing") {
  localStorage.setItem(slot(mode), JSON.stringify({ status, revealedCount }))
}

function setup(mode = "classic", extra = {}) {
  const game = ref({ mode, status: "playing", revealedCount: 0, ...extra })
  return { game, ...usePausedModes(game) }
}

beforeEach(() => {
  localStorage.clear()
})

describe("usePausedModes — marqueurs « en pause »", () => {
  it("vide tant que refreshPausedModes n'a pas tourné", () => {
    pause("infinite", 100)

    expect(setup().pausedModes.value).toEqual({})
  })

  it("marque les modes dont le slot contient une partie en cours", () => {
    pause("infinite", 100)
    pause("legacy", 4)
    const { pausedModes, refreshPausedModes } = setup("classic")

    refreshPausedModes()

    expect(pausedModes.value).toEqual({
      classic: false,
      infinite: true,
      treasure: false,
      legacy: true,
    })
  })

  it("ne marque jamais le mode affiché, même avec un slot", () => {
    pause("classic", 10)
    const { pausedModes, refreshPausedModes } = setup("classic")

    refreshPausedModes()

    expect(pausedModes.value.classic).toBe(false)
  })

  it("ignore un slot terminé", () => {
    pause("infinite", 100, "lost")
    const { pausedModes, refreshPausedModes } = setup("classic")

    refreshPausedModes()

    expect(pausedModes.value.infinite).toBe(false)
  })

  it("suit le changement de mode et de slot au prochain refresh", () => {
    pause("infinite", 100)
    const { game, pausedModes, refreshPausedModes } = setup("classic")
    refreshPausedModes()
    expect(pausedModes.value.infinite).toBe(true)

    game.value = { mode: "infinite", status: "playing", revealedCount: 100 }
    localStorage.removeItem(slot("infinite"))
    pause("classic", 3)
    refreshPausedModes()

    expect(pausedModes.value).toMatchObject({ infinite: false, classic: true })
  })
})

describe("usePausedModes — meaningfulGameInMode", () => {
  it("mode à l'écran : la partie affichée compte si elle a progressé", () => {
    const empty = setup("classic", { revealedCount: 0 })
    const played = setup("classic", { revealedCount: 3 })

    expect(empty.meaningfulGameInMode("classic")).toBe(false)
    expect(played.meaningfulGameInMode("classic")).toBe(true)
  })

  it("mode à l'écran : une partie terminée ne compte pas", () => {
    const { meaningfulGameInMode } = setup("classic", {
      revealedCount: 30,
      status: "won",
    })

    expect(meaningfulGameInMode("classic")).toBe(false)
  })

  it("mode à l'écran, infini : l'ouverture de départ ne compte pas", () => {
    const opening = setup("infinite", { revealedCount: MAX_OPENING_REVEAL })
    const explored = setup("infinite", {
      revealedCount: MAX_OPENING_REVEAL + 1,
    })

    expect(opening.meaningfulGameInMode("infinite")).toBe(false)
    expect(explored.meaningfulGameInMode("infinite")).toBe(true)
  })

  it("autre mode : c'est le slot en pause qui compte", () => {
    const { meaningfulGameInMode } = setup("classic", { revealedCount: 99 })

    expect(meaningfulGameInMode("legacy")).toBe(false)

    pause("legacy", 1)
    expect(meaningfulGameInMode("legacy")).toBe(true)
  })

  it("autre mode, infini : même seuil sur le slot en pause", () => {
    const { meaningfulGameInMode } = setup("classic")

    pause("infinite", MAX_OPENING_REVEAL)
    expect(meaningfulGameInMode("infinite")).toBe(false)

    pause("infinite", MAX_OPENING_REVEAL + 1)
    expect(meaningfulGameInMode("infinite")).toBe(true)
  })

  it("autre mode : un slot terminé ne compte pas", () => {
    const { meaningfulGameInMode } = setup("classic")
    pause("legacy", 40, "lost")

    expect(meaningfulGameInMode("legacy")).toBe(false)
  })
})
