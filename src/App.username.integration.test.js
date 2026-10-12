// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { flushPromises } from "@vue/test-utils"
import { username, usernamePrompted } from "./state/username"
import {
  requireUsernameChoice,
  clearUsernameChoice,
} from "./state/usernameChoice"
import { useAppHarness, wrapper, mountApp } from "../test/appHarness"

// Appareil tactile : le popup « HOW TO PLAY » (tap / long-press) n'existe que
// là, et c'est lui qui doit attendre la fin du dialogue de pseudo.
vi.mock("./state/settings", async (importOriginal) => ({
  ...(await importOriginal()),
  isTouchDevice: true,
}))

// Intégration d'App.vue : dialogue de pseudo du premier lancement, ordre au
// démarrage et déclencheurs des renvois en ligne (boot, retour du réseau).

useAppHarness()

const SEEN_TAP_INTRO_KEY = "hibol-minesweeper:seen-tap-intro"
const PLAYERS_URL = /\/api\/legacy\/players\//

let fetchMock

beforeEach(() => {
  usernamePrompted.value = false
  // Réclamation acceptée, relecture du pseudo sans changement.
  fetchMock = vi.fn((_url, options) =>
    Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve(
          options?.method === "POST" ? { username: "alice" } : {},
        ),
    }),
  )
  vi.stubGlobal("fetch", fetchMock)
})

afterEach(() => {
  usernamePrompted.value = false
  username.value = ""
  clearUsernameChoice()
})

const playersCalls = () =>
  fetchMock.mock.calls.filter(([url]) => PLAYERS_URL.test(url))

describe("App.vue — pseudo du premier lancement", () => {
  it("dialogue d'abord, popup tap/long-press seulement une fois le nom validé", async () => {
    await mountApp()

    expect(wrapper.find(".username-overlay").exists()).toBe(true)
    expect(wrapper.find(".intro-overlay").exists()).toBe(false)

    await wrapper.find(".username-input").setValue("alice")
    await wrapper.find(".username-box .pixel-btn").trigger("click") // réclame
    await flushPromises()
    expect(wrapper.find(".intro-overlay").exists()).toBe(false)

    await wrapper.find(".username-box .pixel-btn").trigger("click") // OK
    await flushPromises()

    expect(wrapper.find(".username-overlay").exists()).toBe(false)
    expect(usernamePrompted.value).toBe(true)
    expect(wrapper.find(".intro-overlay").text()).toContain("HOW TO PLAY")
  })

  it("pseudo déjà proposé : pas de dialogue, le popup tap/long-press s'ouvre aussitôt", async () => {
    usernamePrompted.value = true

    await mountApp()

    expect(wrapper.find(".username-overlay").exists()).toBe(false)
    expect(wrapper.find(".intro-overlay").text()).toContain("HOW TO PLAY")
  })
})

describe("App.vue — démarrage avec une partie reprise", () => {
  beforeEach(() => {
    usernamePrompted.value = true
    localStorage.setItem(SEEN_TAP_INTRO_KEY, "true")
  })

  // Joue un coup, sauvegarde par pagehide, remonte l'App : la partie est reprise.
  async function resumeAPlayedGame() {
    await mountApp()
    await wrapper.find(".cell").trigger("click")
    window.dispatchEvent(new Event("pagehide"))
    wrapper.unmount()
    await mountApp()
    expect(wrapper.vm.game.revealedCount).toBeGreaterThan(0)
  }

  it("un refus de pseudo arrivé après le boot ne reste pas coincé derrière la partie reprise", async () => {
    await resumeAPlayedGame()
    expect(wrapper.find(".username-overlay").exists()).toBe(false)

    requireUsernameChoice("taken", "test")
    await flushPromises()

    expect(wrapper.find(".username-overlay").exists()).toBe(true)
  })

  it("mais une case ouverte de plus la rend « en cours » : le dialogue attend", async () => {
    await resumeAPlayedGame()
    // Une case sûre (une mine perdrait la partie, qui libérerait le dialogue).
    const game = wrapper.vm.game
    const safe = [...game.cells.values()].find(
      (cell) => !cell.isMine && !cell.revealed,
    )
    const before = game.revealedCount
    await wrapper
      .findAll(".cell")
      [safe.y * game.width + safe.x].trigger("click")
    expect(game.revealedCount).toBeGreaterThan(before)

    requireUsernameChoice("taken", "test")
    await flushPromises()

    expect(wrapper.find(".username-overlay").exists()).toBe(false)
  })
})

describe("App.vue — renvois en ligne", () => {
  beforeEach(() => {
    usernamePrompted.value = true
    localStorage.setItem(SEEN_TAP_INTRO_KEY, "true")
  })

  it("lancés au démarrage (relecture du pseudo)", async () => {
    await mountApp()

    expect(playersCalls()).toHaveLength(1)
  })

  it("relancés au retour du réseau", async () => {
    await mountApp()
    fetchMock.mockClear()

    window.dispatchEvent(new Event("online"))
    await flushPromises()

    expect(playersCalls()).toHaveLength(1)
  })
})
