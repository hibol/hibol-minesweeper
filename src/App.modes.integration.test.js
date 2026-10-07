// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"
import { flushPromises } from "@vue/test-utils"
import BurgerMenu from "./components/BurgerMenu.vue"
import { treasureDayKey, hibolBalance } from "./state/treasureHunt"
import { treasureEntries } from "./state/treasureLog"
import { inventory } from "./state/shop"
import { unlockedAchievements } from "./state/achievements"
import { getCell, revealCell } from "./game/game"
import {
  useAppHarness,
  K,
  wrapper,
  mountApp,
  modeButton,
} from "../test/appHarness"

// Intégration d'App.vue : bascule entre modes, choix du mode au démarrage,
// bouton New game et confirmations de perte (helpers : test/appHarness.js).

useAppHarness()

describe("App.vue — orchestration des modes", () => {
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
    // mines/tornades doit être visible.
    expect(wrapper.find(".legacy-timer").exists()).toBe(false)
    const footer = wrapper.find(".app-footer")
    expect(footer.find('[aria-label="Mines hit: 0/3"]').exists()).toBe(true)
    expect(footer.find('[aria-label="Tornadoes: 3"]').exists()).toBe(true)
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

    // Jour résolu sans snapshot : la chasse ne se rejoue pas, on reste sur place.
    await treasureBtn().trigger("click")
    await flushPromises()
    expect(wrapper.vm.game.mode).toBe("classic")
    expect(treasureBtn().find(".mode-available-dot").exists()).toBe(false)
  })

  it("chasse déjà résolue sans snapshot : le boot ne la relance pas", async () => {
    const dayKey = treasureDayKey()
    localStorage.setItem(K.infiniteUnlocked, "true")
    localStorage.setItem(K.lastMode, "treasure")
    treasureEntries.value = [{ dayKey, seed: Number(dayKey), outcome: "lost" }]

    await mountApp()

    expect(wrapper.vm.game.mode).toBe("classic")
    expect(
      localStorage.getItem(`hibol-minesweeper:treasure-hunt:${dayKey}`),
    ).toBeNull()
  })

  it("chasse en cours : ni bouton New game, ni redémarrage en recliquant", async () => {
    localStorage.setItem(K.infiniteUnlocked, "true")
    await mountApp()
    const treasureBtn = () =>
      wrapper.findAll(".mode-btn").find((b) => b.text().includes("Treasure"))
    await treasureBtn().trigger("click")
    await flushPromises()
    const hunt = wrapper.vm.game
    expect(hunt.mode).toBe("treasure")
    expect(wrapper.find(".restart-game").exists()).toBe(false)

    await treasureBtn().trigger("click")
    await flushPromises()
    expect(wrapper.vm.game).toBe(hunt)
  })

  it("chasse : un hibol révélé hors champ n'est ni compté ni crédité", async () => {
    localStorage.setItem(K.infiniteUnlocked, "true")
    await mountApp()

    const treasureBtn = wrapper
      .findAll(".mode-btn")
      .find((b) => b.text().includes("Treasure"))
    await treasureBtn.trigger("click")
    await flushPromises()
    expect(wrapper.vm.game.mode).toBe("treasure")

    // Placement pseudo-aléatoire depuis la seed : on scanne au lieu de viser
    // une coordonnée fixe, même idiome que game.treasure.test.js pour le
    // coffre/une tornade.
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

    const rewardBefore = hibolBalance.value
    // Rend la case atteignable (un voisin révélé suffit, cf. revealCell).
    getCell(wrapper.vm.game, hibol.x + 1, hibol.y).revealed = true
    revealCell(wrapper.vm.game, hibol)
    await flushPromises()

    // Le viewport jsdom (sans layout) ne couvre que la case d'origine : le
    // hibol reste en attente. Le crédit à l'entrée dans le champ est couvert
    // par useTreasureHunt.test.js.
    expect(wrapper.vm.game.hibolsCollectedCount).toBe(0)
    expect(hibolBalance.value).toBe(rewardBefore)
    expect(wrapper.find('[aria-label^="Hibols"]').exists()).toBe(false)
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

describe("App.vue — bouton New game (Classic et Legacy)", () => {
  const restartBtn = () => wrapper.find(".restart-game")

  it("classic sans progression : redémarre directement", async () => {
    await mountApp()
    const before = wrapper.vm.game

    expect(restartBtn().text()).toBe("New game")
    await restartBtn().trigger("click")

    expect(wrapper.find(".confirm-overlay").exists()).toBe(false)
    expect(wrapper.vm.game).not.toBe(before)
    expect(wrapper.vm.game.mode).toBe("classic")
  })

  it("classic avec progression : confirmation, puis partie neuve si on confirme", async () => {
    await mountApp()
    await wrapper.find(".cell").trigger("click")
    expect(wrapper.vm.game.revealedCount).toBeGreaterThan(0)
    const before = wrapper.vm.game

    await restartBtn().trigger("click")
    expect(wrapper.find(".confirm-overlay").exists()).toBe(true)
    expect(wrapper.find(".confirm-sub").text()).toMatch(
      /^\d+ cells revealed will be lost$/,
    )
    expect(wrapper.vm.game).toBe(before)

    const discard = wrapper
      .findAll(".confirm-actions button")
      .find((b) => b.text() === "Discard")
    await discard.trigger("click")

    expect(wrapper.find(".confirm-overlay").exists()).toBe(false)
    expect(wrapper.vm.game).not.toBe(before)
    expect(wrapper.vm.game.revealedCount).toBe(0)
  })

  it("classic terminée (gagnée ou perdue) : redémarre sans confirmation", async () => {
    await mountApp()
    for (const status of ["won", "lost"]) {
      await wrapper.find(".cell").trigger("click")
      wrapper.vm.game.status = status
      await flushPromises()
      const before = wrapper.vm.game

      await restartBtn().trigger("click")

      expect(wrapper.find(".confirm-overlay").exists()).toBe(false)
      expect(wrapper.vm.game).not.toBe(before)
      expect(wrapper.vm.game.status).toBe("playing")
    }
  })

  it("legacy : même bouton, même difficulté", async () => {
    inventory.value.legacyMode = 1
    await mountApp()
    await wrapper
      .findAll(".mode-btn")
      .find((b) => b.text().includes("Legacy"))
      .trigger("click")
    await wrapper
      .findAll(".legacy-menu-item")
      .find((b) => b.text() === "Intermediate")
      .trigger("click")
    await flushPromises()
    const before = wrapper.vm.game

    await restartBtn().trigger("click")

    expect(wrapper.vm.game).not.toBe(before)
    expect(wrapper.vm.game.mode).toBe("legacy")
    expect(wrapper.vm.game.difficulty).toBe("intermediate")
  })
})

describe("App.vue — choix du mode au démarrage", () => {
  it.each([
    ["infinite", false, "classic"], // verrouillé : retour au classic
    ["treasure", false, "classic"], // partage le verrou de l'infini
    ["legacy", false, "classic"], // Legacy pas acheté (ou reset entre-temps)
    ["classic", true, "legacy"], // Legacy acheté remplace le classic
    ["legacy", true, "legacy"],
    [null, false, "classic"], // premier lancement
  ])(
    "dernier mode %s (Legacy acheté : %s) : on rouvre en %s",
    async (lastMode, legacyBought, expected) => {
      if (lastMode) {
        localStorage.setItem(K.lastMode, lastMode)
      }
      if (legacyBought) {
        inventory.value.legacyMode = 1
      }

      await mountApp()

      expect(wrapper.vm.game.mode).toBe(expected)
    },
  )

  it("mode débloqué : on rouvre dessus", async () => {
    localStorage.setItem(K.infiniteUnlocked, "true")
    localStorage.setItem(K.lastMode, "treasure")

    await mountApp()

    expect(wrapper.vm.game.mode).toBe("treasure")
  })

  it.each([
    ["JSON illisible", "{pas du json"],
    [
      "snapshot incomplet",
      JSON.stringify({ mode: "infinite", status: "playing" }),
    ],
  ])(
    "slot infini corrompu (%s) : abandonné, une partie neuve démarre",
    async (_label, raw) => {
      localStorage.setItem(K.infiniteUnlocked, "true")
      localStorage.setItem(K.lastMode, "infinite")
      localStorage.setItem(K.infiniteSlot, raw)

      await mountApp()

      expect(wrapper.vm.game.mode).toBe("infinite")
      expect(wrapper.vm.game.status).toBe("playing")
      // Seed d'une partie neuve (Date.now()), pas celle d'un snapshot.
      expect(wrapper.vm.game.seed).toBeGreaterThan(1e12)
      expect(localStorage.getItem(K.infiniteSlot)).toBeNull()
    },
  )

  it("slot terminé : ignoré au démarrage, une partie neuve démarre", async () => {
    localStorage.setItem(K.infiniteUnlocked, "true")
    localStorage.setItem(K.lastMode, "infinite")
    await mountApp()
    // Vrai snapshot (complet) d'une partie, puis marqué terminé : seul le
    // statut doit l'écarter, pas un format illisible.
    window.dispatchEvent(new Event("pagehide"))
    const saved = JSON.parse(localStorage.getItem(K.infiniteSlot))
    saved.status = "lost"
    localStorage.setItem(K.infiniteSlot, JSON.stringify(saved))
    wrapper.unmount()

    await mountApp()

    expect(wrapper.vm.game.mode).toBe("infinite")
    expect(wrapper.vm.game.status).toBe("playing")
    expect(wrapper.vm.game.seed).not.toBe(saved.seed)
  })
})

describe("App.vue — nouvelle partie : confirmation de perte et bascules", () => {
  afterEach(() => {
    unlockedAchievements.value = {}
  })

  const dialogButton = (label) =>
    wrapper.findAll(".confirm-actions button").find((b) => b.text() === label)

  // Une run infinie « qui vaut la peine » : au-delà de l'ouverture de départ.
  async function infiniteWithProgress(revealedCount = 100) {
    localStorage.setItem(K.infiniteUnlocked, "true")
    localStorage.setItem(K.lastMode, "infinite")
    await mountApp()
    wrapper.vm.game.revealedCount = revealedCount
    await flushPromises()
  }

  it("infini : re-cliquer le mode demande confirmation, annuler garde la run", async () => {
    await infiniteWithProgress(100)
    const before = wrapper.vm.game

    await modeButton("Infinite").trigger("click")

    expect(wrapper.find(".confirm-sub").text()).toBe(
      "100 cells explored will be lost",
    )
    await dialogButton("Cancel").trigger("click")
    expect(wrapper.find(".confirm-overlay").exists()).toBe(false)
    expect(wrapper.vm.game).toBe(before)
  })

  it("infini : confirmer repart d'une partie neuve", async () => {
    await infiniteWithProgress(100)
    const before = wrapper.vm.game

    await modeButton("Infinite").trigger("click")
    await dialogButton("Discard").trigger("click")

    expect(wrapper.vm.game).not.toBe(before)
    expect(wrapper.vm.game.revealedCount).toBeLessThanOrEqual(60)
    expect(wrapper.find(".confirm-overlay").exists()).toBe(false)
  })

  it("infini : l'ouverture de départ seule ne demande pas de confirmation", async () => {
    await infiniteWithProgress(60)
    const before = wrapper.vm.game

    await modeButton("Infinite").trigger("click")

    expect(wrapper.find(".confirm-overlay").exists()).toBe(false)
    expect(wrapper.vm.game).not.toBe(before)
  })

  it("PLAY A SEED depuis un autre mode : confirme la perte de la run en pause, puis la lance", async () => {
    await infiniteWithProgress(100)
    // Infini -> classic : la run infinie part dans son slot, « en pause ».
    await modeButton("Classic").trigger("click")
    await flushPromises()
    expect(wrapper.vm.game.mode).toBe("classic")

    wrapper.findComponent(BurgerMenu).vm.$emit("start-infinite-with-seed", 4242)
    await flushPromises()

    expect(wrapper.vm.game.mode).toBe("classic")
    expect(wrapper.find(".confirm-sub").text()).toBe(
      "100 cells explored will be lost",
    )
    expect(unlockedAchievements.value["seed-hunter"]).toBeTruthy()

    await dialogButton("Discard").trigger("click")
    await flushPromises()

    expect(wrapper.vm.game.mode).toBe("infinite")
    // La génération peut décaler la seed d'un cran si l'ouverture est trop
    // grande (MAX_OPENING_REVEAL), jamais la réduire.
    expect(wrapper.vm.game.seed).toBeGreaterThanOrEqual(4242)
    expect(wrapper.vm.game.seed).toBeLessThan(4242 + 100)
  })

  it("PLAY A SEED sans run en pause : démarre aussitôt", async () => {
    localStorage.setItem(K.infiniteUnlocked, "true")
    await mountApp()

    wrapper.findComponent(BurgerMenu).vm.$emit("start-infinite-with-seed", 4242)
    await flushPromises()

    expect(wrapper.find(".confirm-overlay").exists()).toBe(false)
    expect(wrapper.vm.game.mode).toBe("infinite")
    expect(wrapper.vm.game.seed).toBeGreaterThanOrEqual(4242)
  })

  describe("Legacy : choix de difficulté depuis un autre mode", () => {
    // Legacy beginner avec une case révélée, puis retour en Infini : la partie
    // Legacy est en pause dans son slot.
    async function legacyBeginnerPaused() {
      inventory.value.legacyMode = 1
      localStorage.setItem(K.infiniteUnlocked, "true")
      await mountApp()
      await modeButton("Legacy").trigger("click")
      await wrapper
        .findAll(".legacy-menu-item")
        .find((b) => b.text() === "Beginner")
        .trigger("click")
      const el = wrapper.findAll(".cell")[0]
      await el.trigger("pointerdown")
      await el.trigger("click")
      const progress = wrapper.vm.game.revealedCount
      expect(progress).toBeGreaterThan(0)

      await modeButton("Infinite").trigger("click")
      await flushPromises()
      expect(wrapper.vm.game.mode).toBe("infinite")
      return progress
    }

    const pickDifficulty = async (label) => {
      await modeButton("Legacy").trigger("click")
      await wrapper
        .findAll(".legacy-menu-item")
        .find((b) => b.text() === label)
        .trigger("click")
      await flushPromises()
    }

    it("même difficulté : la partie en pause reprend", async () => {
      const progress = await legacyBeginnerPaused()

      await pickDifficulty("Beginner")

      expect(wrapper.find(".confirm-overlay").exists()).toBe(false)
      expect(wrapper.vm.game.mode).toBe("legacy")
      expect(wrapper.vm.game.difficulty).toBe("beginner")
      expect(wrapper.vm.game.revealedCount).toBe(progress)
    })

    it("autre difficulté : confirmation, puis partie neuve à ce niveau", async () => {
      const progress = await legacyBeginnerPaused()

      await pickDifficulty("Expert")

      expect(wrapper.vm.game.mode).toBe("infinite")
      expect(wrapper.find(".confirm-sub").text()).toBe(
        `${progress} cells revealed will be lost`,
      )

      await dialogButton("Discard").trigger("click")
      await flushPromises()

      expect(wrapper.vm.game.mode).toBe("legacy")
      expect(wrapper.vm.game.difficulty).toBe("expert")
      expect(wrapper.vm.game.revealedCount).toBe(0)
    })
  })
})
