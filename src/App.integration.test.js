// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mount, flushPromises } from "@vue/test-utils"
import App from "./App.vue"
import { treasureDayKey } from "./treasureHunt"
import { inventory } from "./shop"

// Filet de sécurité AVANT de dégraisser App.vue : App.vue orchestre la bascule
// de mode, la persistance par slot et le boot — c'est ce qui va bouger, et
// aucun test ne le couvrait. `game` est exposé via defineExpose.

const K = {
  infiniteUnlocked: "hibol-minesweeper:infinite-unlocked",
  lastMode: "hibol-minesweeper:last-mode",
  classicSlot: "hibol-minesweeper:active-game:classic",
  infiniteSlot: "hibol-minesweeper:active-game:infinite",
}

let wrapper

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  // legacyUnlocked (shop.js) est un singleton de module, pas réinitialisé par
  // localStorage.clear() — évite de fuiter vers d'autres tests du fichier.
  delete inventory.value.legacyMode
})

async function mountApp() {
  wrapper = mount(App)
  await flushPromises()
  return wrapper
}

describe("App.vue — orchestration (filet avant dégraissage)", () => {
  it("démarre en classic et affiche le plateau", async () => {
    await mountApp()
    expect(wrapper.vm.game.mode).toBe("classic")
    expect(wrapper.findAll(".cell").length).toBeGreaterThan(0)
  })

  it("reboot dans le dernier mode joué (infini) avec sa barre de danger", async () => {
    localStorage.setItem(K.infiniteUnlocked, "true")
    localStorage.setItem(K.lastMode, "infinite")

    await mountApp()

    expect(wrapper.vm.game.mode).toBe("infinite")
    expect(wrapper.find(".danger-row").exists()).toBe(true)
  })

  it("changer de mode sauvegarde la partie sortante et la restaure au retour", async () => {
    localStorage.setItem(K.infiniteUnlocked, "true")
    await mountApp()

    // progrès en classic
    await wrapper.find(".cell").trigger("click")
    const progress = wrapper.vm.game.revealedCount
    expect(progress).toBeGreaterThan(0)

    // classic -> infinite : le slot classic est écrit
    const infiniteBtn = wrapper
      .findAll(".mode-btn")
      .find((b) => b.text().includes("Infinite Game"))
    await infiniteBtn.trigger("click")
    await flushPromises()

    expect(wrapper.vm.game.mode).toBe("infinite")
    const saved = JSON.parse(localStorage.getItem(K.classicSlot))
    expect(saved.revealedCount).toBe(progress)

    // infinite -> classic : progrès restauré + pastille "en pause" sur infini
    const classicBtn = wrapper
      .findAll(".mode-btn")
      .find((b) => b.text().includes("Classic Game"))
    await classicBtn.trigger("click")
    await flushPromises()

    expect(wrapper.vm.game.mode).toBe("classic")
    expect(wrapper.vm.game.revealedCount).toBe(progress)
    expect(localStorage.getItem(K.infiniteSlot)).not.toBeNull()
    expect(wrapper.find(".mode-paused-dot").exists()).toBe(true)
  })

  it("reprend la chasse au trésor du jour depuis son snapshot", async () => {
    const dayKey = treasureDayKey()
    localStorage.setItem(K.infiniteUnlocked, "true")
    localStorage.setItem(K.lastMode, "treasure")
    localStorage.setItem(
      `hibol-minesweeper:treasure-hunt:${dayKey}`,
      JSON.stringify({
        dayKey,
        mode: "treasure",
        seed: Number(dayKey),
        status: "playing",
        unlimitedLives: false,
        tornadoCount: 3, // une partie fraîche serait à 0
        chestFound: false,
        revealedCount: 5,
        flaggedCount: 0,
        minesTriggeredCount: 0,
        maxDistance: 10,
        cells: [],
        engaged: false,
        banner: null,
        camera: { originX: 0, originY: 0, cellSize: 28 },
      }),
    )

    await mountApp()

    expect(wrapper.vm.game.mode).toBe("treasure")
    expect(wrapper.vm.game.tornadoCount).toBe(3)
    expect(wrapper.find(".treasure-timer").exists()).toBe(true)
  })

  it("legacy : un flag avant tout reveal alimente le journal de coups, dans l'ordre, avec t:0 sur le flag", async () => {
    // legacyUnlocked (shop.js) lit inventory, un singleton de module déjà
    // chargé par les tests précédents du fichier — localStorage seul (comme
    // pour infiniteUnlocked, un ref local à App.vue) ne suffirait pas ici.
    inventory.value.legacyMode = 1
    await mountApp()

    const legacyBtn = wrapper
      .findAll(".mode-btn")
      .find((b) => b.text().includes("Legacy"))
    await legacyBtn.trigger("click")
    await flushPromises()

    const beginnerBtn = wrapper
      .findAll(".legacy-menu-item")
      .find((b) => b.text() === "Beginner")
    await beginnerBtn.trigger("click")
    await flushPromises()

    expect(wrapper.vm.game.mode).toBe("legacy")

    const cells = wrapper.findAll(".cell")
    await cells[0].trigger("contextmenu") // flag, avant tout reveal
    // pointerdown d'abord : un vrai tap déclenche 'press-start' avant 'click'
    // (MineGrid.vue), ce qui réarme longPressHandled — sinon le flag qui
    // précède laisse ce flag à true et le click suivant serait avalé en silence.
    await cells[1].trigger("pointerdown")
    await cells[1].trigger("click") // reveal

    // t=0 est ancré sur le tout 1er coup enregistré (le flag ici), pas sur
    // legacyEngage() — cf. temp/leaderboards-plan.md.
    expect(wrapper.vm.legacyMoveLog.moves.value).toEqual([
      { t: 0, type: "flag", x: expect.any(Number), y: expect.any(Number) },
      {
        t: expect.any(Number),
        type: "reveal",
        x: expect.any(Number),
        y: expect.any(Number),
      },
    ])
  })
})
