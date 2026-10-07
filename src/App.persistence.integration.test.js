// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import BurgerMenu from "./components/BurgerMenu.vue"
import { treasureDayKey } from "./state/treasureHunt"
import { inventory } from "./state/shop"
import { playerId, PLAYER_ID_KEY } from "./state/playerId"
import {
  useAppHarness,
  K,
  wrapper,
  mountApp,
  modeButton,
} from "../test/appHarness"

// Intégration d'App.vue : sauvegarde en quittant la page, reset et import.

useAppHarness()

// Le chrono (useRunTimer) lit performance.now() et se rafraîchit par setInterval.
const FAKE_CLOCK = ["setInterval", "clearInterval", "setTimeout", "performance"]

function setVisibility(state) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  })
  document.dispatchEvent(new Event("visibilitychange"))
}

describe("App.vue — sauvegarde en quittant la page (onglet masqué, pagehide)", () => {
  afterEach(() => {
    // Retire la propriété posée par setVisibility : retour au getter de jsdom.
    delete document.visibilityState
    vi.useRealTimers()
  })

  it("infini : le slot, caméra comprise, n'existe qu'une fois l'onglet masqué", async () => {
    localStorage.setItem(K.infiniteUnlocked, "true")
    localStorage.setItem(K.lastMode, "infinite")
    await mountApp()
    expect(localStorage.getItem(K.infiniteSlot)).toBeNull()

    setVisibility("hidden")

    const saved = JSON.parse(localStorage.getItem(K.infiniteSlot))
    expect(saved.mode).toBe("infinite")
    expect(saved.seed).toBe(wrapper.vm.game.seed)
    expect(saved.camera).toEqual({
      originX: expect.any(Number),
      originY: expect.any(Number),
      cellSize: expect.any(Number),
    })
  })

  it("classic : la progression est sauvegardée", async () => {
    await mountApp()
    await wrapper.find(".cell").trigger("click")
    const progress = wrapper.vm.game.revealedCount
    expect(progress).toBeGreaterThan(0)

    setVisibility("hidden")

    expect(JSON.parse(localStorage.getItem(K.classicSlot)).revealedCount).toBe(
      progress,
    )
  })

  it("pagehide sauvegarde comme l'onglet masqué", async () => {
    await mountApp()
    await wrapper.find(".cell").trigger("click")

    window.dispatchEvent(new Event("pagehide"))

    expect(localStorage.getItem(K.classicSlot)).not.toBeNull()
  })

  it("le retour sur l'onglet ne réécrit rien", async () => {
    await mountApp()
    await wrapper.find(".cell").trigger("click")
    setVisibility("hidden")
    localStorage.removeItem(K.classicSlot)

    setVisibility("visible")

    expect(localStorage.getItem(K.classicSlot)).toBeNull()
  })

  it("legacy : le chrono s'arrête onglet masqué et repart au retour", async () => {
    inventory.value.legacyMode = 1
    await mountApp()
    vi.useFakeTimers({ toFake: FAKE_CLOCK })
    await modeButton("Legacy").trigger("click")
    await wrapper
      .findAll(".legacy-menu-item")
      .find((b) => b.text() === "Beginner")
      .trigger("click")
    // Le 1er reveal lance le chrono.
    const el = wrapper.findAll(".cell")[0]
    await el.trigger("pointerdown")
    await el.trigger("click")

    const elapsed = () =>
      JSON.parse(localStorage.getItem("hibol-minesweeper:active-game:legacy"))
        .elapsedMs

    vi.advanceTimersByTime(3000)
    setVisibility("hidden")
    const atHide = elapsed()
    expect(atHide).toBeGreaterThanOrEqual(3000)

    // Masqué : le temps passe, pas le chrono.
    vi.advanceTimersByTime(5000)
    window.dispatchEvent(new Event("pagehide"))
    expect(elapsed()).toBe(atHide)

    // Retour : il repart.
    setVisibility("visible")
    vi.advanceTimersByTime(2000)
    setVisibility("hidden")
    expect(elapsed()).toBeGreaterThanOrEqual(atHide + 2000)
    expect(elapsed()).toBeLessThan(atHide + 5000)
  })

  it("chasse : le chrono s'arrête onglet masqué et repart au retour", async () => {
    const dayKey = treasureDayKey()
    const slot = `hibol-minesweeper:treasure-hunt:${dayKey}`
    localStorage.setItem(K.infiniteUnlocked, "true")
    localStorage.setItem(K.lastMode, "treasure")
    localStorage.setItem(
      slot,
      JSON.stringify({
        dayKey,
        mode: "treasure",
        seed: Number(dayKey),
        status: "playing",
        unlimitedLives: false,
        tornadoCount: 0,
        chestFound: false,
        revealedCount: 5,
        flaggedCount: 0,
        minesTriggeredCount: 0,
        maxDistance: 0,
        cells: [],
        engaged: true,
        elapsedMs: 10000,
        banner: null,
        camera: { originX: 0, originY: 0, cellSize: 28 },
      }),
    )
    vi.useFakeTimers({ toFake: FAKE_CLOCK })
    await mountApp()
    expect(wrapper.vm.game.mode).toBe("treasure")

    const elapsed = () => JSON.parse(localStorage.getItem(slot)).elapsedMs

    vi.advanceTimersByTime(2000)
    setVisibility("hidden")
    const atHide = elapsed()
    expect(atHide).toBeGreaterThanOrEqual(12000)

    vi.advanceTimersByTime(5000)
    window.dispatchEvent(new Event("pagehide"))
    expect(elapsed()).toBe(atHide)

    setVisibility("visible")
    vi.advanceTimersByTime(1000)
    setVisibility("hidden")
    expect(elapsed()).toBeGreaterThanOrEqual(atHide + 1000)
    expect(elapsed()).toBeLessThan(atHide + 4000)
  })
})

describe("App.vue — reset et import de sauvegarde", () => {
  let reload

  beforeEach(() => {
    reload = vi.fn()
    // location.reload n'existe pas dans jsdom : App.vue l'appelle comme global.
    vi.stubGlobal("location", { ...window.location, reload })
  })

  afterEach(() => {
    delete document.visibilityState
  })

  const menu = () => wrapper.findComponent(BurgerMenu)

  // Une partie classic avec progression, dont le slot réapparaîtrait si un
  // listener de sauvegarde survivait au reset ou à l'import.
  async function mountWithProgress() {
    localStorage.setItem(K.infiniteUnlocked, "true")
    localStorage.setItem(PLAYER_ID_KEY, playerId)
    localStorage.setItem("hibol-minesweeper:username", "Alice")
    await mountApp()
    await wrapper.find(".cell").trigger("click")
  }

  it("reset complet : tout est effacé, la page se recharge", async () => {
    await mountWithProgress()
    setVisibility("hidden")
    expect(localStorage.getItem(K.classicSlot)).not.toBeNull()

    menu().vm.$emit("reset-everything", { keepOnlineAccount: false })

    expect(Object.keys(localStorage)).toEqual([])
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it("reset en gardant le compte : seule l'identité en ligne reste", async () => {
    await mountWithProgress()
    setVisibility("hidden")

    menu().vm.$emit("reset-everything", { keepOnlineAccount: true })

    expect(Object.keys(localStorage).sort()).toEqual([
      PLAYER_ID_KEY,
      "hibol-minesweeper:username",
    ])
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it("après un reset, quitter la page ne réécrit pas la partie effacée", async () => {
    await mountWithProgress()

    menu().vm.$emit("reset-everything", { keepOnlineAccount: false })
    window.dispatchEvent(new Event("pagehide"))
    setVisibility("hidden")

    expect(localStorage.getItem(K.classicSlot)).toBeNull()
  })

  it("import : le stockage est remplacé par le fichier, hors clés étrangères", async () => {
    await mountWithProgress()
    setVisibility("hidden")

    menu().vm.$emit("import-save", {
      [PLAYER_ID_KEY]: "imported-player",
      "hibol-minesweeper:hibol-balance": "42",
      "autre-appli:cle": "intruse",
    })

    expect(localStorage.getItem("hibol-minesweeper:hibol-balance")).toBe("42")
    expect(localStorage.getItem(PLAYER_ID_KEY)).toBe("imported-player")
    // Absent du fichier : effacé, de même que la partie qui était en cours.
    expect(localStorage.getItem(K.infiniteUnlocked)).toBeNull()
    expect(localStorage.getItem(K.classicSlot)).toBeNull()
    expect(localStorage.getItem("autre-appli:cle")).toBeNull()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it("import : l'identité de cet appareil sera fusionnée avec celle du fichier", async () => {
    await mountWithProgress()
    const deviceId = playerId

    menu().vm.$emit("import-save", { [PLAYER_ID_KEY]: "imported-player" })

    expect(
      JSON.parse(
        localStorage.getItem("hibol-minesweeper:pending-identity-merges"),
      ),
    ).toContainEqual({ from: deviceId, to: "imported-player" })
  })

  it("après un import, quitter la page ne réécrit pas l'ancienne partie", async () => {
    await mountWithProgress()

    menu().vm.$emit("import-save", { [PLAYER_ID_KEY]: "imported-player" })
    window.dispatchEvent(new Event("pagehide"))
    setVisibility("hidden")

    expect(localStorage.getItem(K.classicSlot)).toBeNull()
  })
})
