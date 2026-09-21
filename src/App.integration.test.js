// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mount, flushPromises } from "@vue/test-utils"
import App from "./App.vue"
import { treasureDayKey, chestReward } from "./state/treasureHunt"
import { treasureEntries } from "./state/treasureLog"
import { inventory } from "./state/shop"
import { getCell, revealCell } from "./game/game"

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
  // treasureEntries (treasureLog.js) : même singleton de module, même raison.
  treasureEntries.value = []
  // chestReward (treasureHunt.js) : idem — assignation directe en nettoyage
  // de test seulement, jamais en dehors (cf. addChestReward/spendChestReward).
  chestReward.value = 0
  // fetch stubbé par les tests Give Up ci-dessous (submitInfiniteRun) : jamais
  // laissé fuiter vers un autre test du fichier.
  vi.unstubAllGlobals()
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
    // Le chrono ne s'affiche plus dans le footer (2026-09-20, retiré de
    // l'écran mais toujours calculé en interne) : seul le footer une-ligne
    // LIVES/TORNADOES doit être visible.
    expect(wrapper.find(".treasure-timer").exists()).toBe(false)
    expect(wrapper.find(".app-footer").text()).toContain("TORNADOES 3")
  })

  it("pastille Treasure Hunt : visible si le jour n'a été touché d'aucune façon, éteinte sinon", async () => {
    const dayKey = treasureDayKey()
    localStorage.setItem(K.infiniteUnlocked, "true")

    // Jour vierge : ni snapshot en cours, ni entrée résolue.
    await mountApp()
    const treasureBtn = () =>
      wrapper.findAll(".mode-btn").find((b) => b.text().includes("Treasure"))
    expect(treasureBtn().find(".mode-available-dot").exists()).toBe(true)
    wrapper.unmount()

    // Une partie en cours (snapshot du jour) éteint la pastille.
    localStorage.setItem(
      `hibol-minesweeper:treasure-hunt:${dayKey}`,
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
        maxDistance: 10,
        cells: [],
        engaged: false,
        banner: null,
        camera: { originX: 0, originY: 0, cellSize: 28 },
      }),
    )
    await mountApp()
    expect(treasureBtn().find(".mode-available-dot").exists()).toBe(false)
    wrapper.unmount()
    localStorage.removeItem(`hibol-minesweeper:treasure-hunt:${dayKey}`)

    // Un jour déjà résolu (journal, singleton de module — cf. inventory
    // ci-dessus) éteint aussi la pastille, sans snapshot.
    treasureEntries.value = [{ dayKey, seed: Number(dayKey), outcome: "won" }]
    await mountApp()
    expect(treasureBtn().find(".mode-available-dot").exists()).toBe(false)

    // Entrer dans la chasse (même déjà résolue) l'éteint aussi à l'écran.
    await treasureBtn().trigger("click")
    await flushPromises()
    expect(wrapper.vm.game.mode).toBe("treasure")
    expect(treasureBtn().find(".mode-available-dot").exists()).toBe(false)
  })

  it("chasse : un hibol trouvé banque sa monnaie même si le jour n'est pas résolu (abandon)", async () => {
    localStorage.setItem(K.infiniteUnlocked, "true")
    await mountApp()

    const treasureBtn = wrapper
      .findAll(".mode-btn")
      .find((b) => b.text().includes("Treasure"))
    await treasureBtn.trigger("click")
    await flushPromises()
    expect(wrapper.vm.game.mode).toBe("treasure")

    // Les hibols n'apparaissent qu'assez loin de l'origine (cf.
    // HIBOL_MIN_DENSITY dans game.js) : on scanne au lieu de viser une
    // coordonnée fixe, même idiome que game.treasure.test.js pour le coffre/
    // une tornade.
    let hibol = null
    for (let y = -260; y <= 260 && !hibol; y += 2) {
      for (let x = -260; x <= 260; x += 2) {
        const cell = getCell(wrapper.vm.game, x, y)
        if (cell.isHibol) {
          hibol = cell
          break
        }
      }
    }
    expect(hibol, "aucun hibol matérialisé pour la seed du jour").toBeTruthy()

    const rewardBefore = chestReward.value
    // Rend la case atteignable (un voisin révélé suffit, cf. revealCell).
    getCell(wrapper.vm.game, hibol.x + 1, hibol.y).revealed = true
    revealCell(wrapper.vm.game, hibol)
    await flushPromises()

    expect(wrapper.vm.game.hibolsCollectedCount).toBe(1)
    // Le jour n'est PAS résolu (ni coffre trouvé, ni 3e mine) : le hibol est
    // quand même banqué, immédiatement.
    expect(wrapper.vm.game.status).toBe("playing")
    expect(chestReward.value).toBe(rewardBefore + 1)
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

describe("App.vue — Give Up (Infini) soumet la run au classement en ligne", () => {
  it("envoie le payload exact au nouvel endpoint sans jamais retarder la bannière de fin de run", async () => {
    localStorage.setItem(K.infiniteUnlocked, "true")
    localStorage.setItem(K.lastMode, "infinite")
    await mountApp()

    // Jamais résolue ici : si onGiveUp attendait cet appel, la bannière
    // n'apparaîtrait jamais avant la fin du test — c'est ce qui prouve le
    // caractère non-bloquant, pas juste une absence d'erreur.
    const fetchMock = vi.fn(() => new Promise(() => {}))
    vi.stubGlobal("fetch", fetchMock)

    wrapper.vm.game.minesTriggeredCount = 20 // > darknessMineThreshold (15) : Give Up possible
    wrapper.vm.game.heartsCollectedCount = 4
    wrapper.vm.game.robotsTriggeredCount = 2
    wrapper.vm.game.maxDistance = 123.4
    wrapper.vm.game.revealedCount = 5000
    wrapper.vm.game.usedMachines = true
    await wrapper.vm.$nextTick()

    const giveUpBtn = wrapper.find(".give-up")
    expect(giveUpBtn.exists()).toBe(true)
    await giveUpBtn.trigger("click")
    await wrapper.vm.$nextTick()

    // Bannière de fin de run déjà affichée alors que fetchMock ne s'est
    // toujours pas résolu.
    const banner = wrapper.find(".win-banner")
    expect(banner.exists()).toBe(true)
    expect(banner.text()).toContain("GAME OVER")

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe(
      "https://hibol-minesweeper-api.chez-miette.xyz/api/infinite/submissions",
    )
    expect(options.method).toBe("POST")

    const body = JSON.parse(options.body)
    expect(Object.keys(body).sort()).toEqual(
      [
        "heartsCollected",
        "maxDistance",
        "minesTriggered",
        "playerId",
        "revealedCount",
        "robotsTriggered",
        "usedMachines",
        "username",
      ].sort(),
    )
    expect(body).toMatchObject({
      usedMachines: true,
      maxDistance: 123.4,
      revealedCount: 5000,
      minesTriggered: 20,
      heartsCollected: 4,
      robotsTriggered: 2,
    })
    expect(typeof body.playerId).toBe("string")
    expect(typeof body.username).toBe("string")
  })

  it("un échec réseau est avalé silencieusement : le score reste acquis localement", async () => {
    localStorage.setItem(K.infiniteUnlocked, "true")
    localStorage.setItem(K.lastMode, "infinite")
    await mountApp()

    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("offline"))),
    )

    wrapper.vm.game.minesTriggeredCount = 20
    await wrapper.vm.$nextTick()

    const giveUpBtn = wrapper.find(".give-up")
    await giveUpBtn.trigger("click")
    await flushPromises() // laisse le catch de submitInfiniteRun s'exécuter

    expect(wrapper.vm.game.status).toBe("lost")
    expect(wrapper.find(".win-banner").exists()).toBe(true)
  })
})
