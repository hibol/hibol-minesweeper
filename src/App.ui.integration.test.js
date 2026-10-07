// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest"
import { flushPromises } from "@vue/test-utils"
import { nextTick } from "vue"
import {
  useAppHarness,
  K,
  wrapper,
  mountApp,
  modeButton,
} from "../test/appHarness"

// Intégration d'App.vue : messages « verrouillé », introductions et aide des
// cases spéciales.

useAppHarness()

describe("App.vue — messages « verrouillé » et introductions", () => {
  const INTRO_KEYS = {
    infinite: "hibol-minesweeper:seen-infinite-intro",
    treasure: "hibol-minesweeper:seen-treasure-intro",
  }

  afterEach(() => {
    vi.useRealTimers()
  })

  it("modes verrouillés : chaque clic affiche son message, qui retombe après 2 s", async () => {
    await mountApp()
    // Fake timers après le montage : flushPromises ne doit pas en dépendre.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })

    expect(wrapper.findAll(".locked-hint")).toHaveLength(0)

    await modeButton("Infinite").trigger("click")
    expect(wrapper.findAll(".locked-hint")).toHaveLength(1)

    // Minuterie propre à chaque bouton : le 2e message ne remplace pas le 1er.
    vi.advanceTimersByTime(1000)
    await modeButton("Treasure Hunt").trigger("click")
    expect(wrapper.findAll(".locked-hint")).toHaveLength(2)

    vi.advanceTimersByTime(1000)
    await nextTick()
    expect(wrapper.findAll(".locked-hint")).toHaveLength(1)

    vi.advanceTimersByTime(1000)
    await nextTick()
    expect(wrapper.findAll(".locked-hint")).toHaveLength(0)
    expect(wrapper.vm.game.mode).toBe("classic")
  })

  it("introduction Infini : à la 1re partie, puis plus jamais après « Don't show this again »", async () => {
    localStorage.setItem(K.infiniteUnlocked, "true")
    localStorage.setItem(K.lastMode, "infinite")

    await mountApp()
    expect(wrapper.find(".intro-overlay").text()).toContain(
      "INFINITE MINEFIELD",
    )

    // Fermée sans cocher : rien n'est retenu.
    await wrapper.find(".intro-box .pixel-btn").trigger("click")
    expect(wrapper.find(".intro-overlay").exists()).toBe(false)
    expect(localStorage.getItem(INTRO_KEYS.infinite)).toBeNull()

    wrapper.unmount()
    await mountApp()
    await wrapper.find(".intro-checkbox input").setValue(true)
    await wrapper.find(".intro-box .pixel-btn").trigger("click")
    expect(localStorage.getItem(INTRO_KEYS.infinite)).toBe("true")

    wrapper.unmount()
    await mountApp()
    expect(wrapper.find(".intro-overlay").exists()).toBe(false)
  })

  it("introduction Treasure Hunt : ouverte au lancement du mode, retenue une fois cochée", async () => {
    localStorage.setItem(K.infiniteUnlocked, "true")

    await mountApp()
    expect(wrapper.find(".intro-overlay").exists()).toBe(false)

    await modeButton("Treasure Hunt").trigger("click")
    await flushPromises()
    expect(wrapper.find(".intro-overlay").text()).toContain(
      "DAILY TREASURE HUNT",
    )

    await wrapper.find(".intro-checkbox input").setValue(true)
    await wrapper.find(".intro-box .pixel-btn").trigger("click")
    expect(wrapper.find(".intro-overlay").exists()).toBe(false)
    expect(localStorage.getItem(INTRO_KEYS.treasure)).toBe("true")
    // L'introduction Infini n'a pas été marquée par erreur.
    expect(localStorage.getItem(INTRO_KEYS.infinite)).toBeNull()
  })
})

describe("App.vue — aide des cases spéciales (bouton « ? » du footer)", () => {
  it("un compteur de cœurs ouvre l'explication du cœur, qui se referme", async () => {
    localStorage.setItem(K.infiniteUnlocked, "true")
    localStorage.setItem(K.lastMode, "infinite")
    await mountApp()

    // Sans cœur ramassé : pas de compteur, donc pas de « ? ».
    expect(wrapper.find(".help-btn").exists()).toBe(false)

    wrapper.vm.game.heartsCollectedCount = 2
    await flushPromises()
    expect(wrapper.find(".help-overlay").exists()).toBe(false)

    await wrapper.find(".help-btn").trigger("click")
    expect(wrapper.find(".help-overlay").text()).toContain("HEART")

    await wrapper.find(".help-overlay").trigger("click")
    expect(wrapper.find(".help-overlay").exists()).toBe(false)
  })

  it("le compteur de robots ouvre celui du robot", async () => {
    localStorage.setItem(K.infiniteUnlocked, "true")
    localStorage.setItem(K.lastMode, "infinite")
    await mountApp()

    wrapper.vm.game.robotsTriggeredCount = 1
    await flushPromises()
    await wrapper.find(".help-btn").trigger("click")

    expect(wrapper.find(".help-overlay").text()).toContain("ROBOT")
  })
})
