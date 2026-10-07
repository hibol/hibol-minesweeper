// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mount, flushPromises } from "@vue/test-utils"
import { nextTick } from "vue"
import App from "./App.vue"
import BurgerMenu from "./components/BurgerMenu.vue"
import { treasureDayKey, hibolBalance } from "./state/treasureHunt"
import { treasureEntries } from "./state/treasureLog"
import { inventory } from "./state/shop"
import { unlockedAchievements } from "./state/achievements"
import { getCell, revealCell } from "./game/game"
import { usernamePrompted } from "./state/username"
import { playerId, PLAYER_ID_KEY } from "./state/playerId"
import {
  usernameChoice,
  requireUsernameChoice,
  clearUsernameChoice,
} from "./state/usernameChoice"

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
  // hibolBalance (treasureHunt.js) : idem — assignation directe en nettoyage
  // de test seulement, jamais en dehors (cf. addHibols/spendHibols).
  hibolBalance.value = 0
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

describe("App.vue — fin de partie Legacy", () => {
  const SUBMISSIONS_URL =
    "https://hibol-minesweeper-api.chez-miette.xyz/api/legacy/submissions"
  let fetchMock

  beforeEach(() => {
    inventory.value.legacyMode = 1
    // Aucun meilleur temps serveur (GET /best), soumission acceptée.
    fetchMock = vi.fn((url) =>
      jsonResponse(
        url === SUBMISSIONS_URL ? { accepted: true } : { timeMs: null },
      ),
    )
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    unlockedAchievements.value = {}
  })

  function jsonResponse(body) {
    return Promise.resolve({ ok: true, json: () => Promise.resolve(body) })
  }

  async function startBeginner() {
    await mountApp()
    await wrapper
      .findAll(".mode-btn")
      .find((b) => b.text().includes("Legacy"))
      .trigger("click")
    await wrapper
      .findAll(".legacy-menu-item")
      .find((b) => b.text() === "Beginner")
      .trigger("click")
    await flushPromises()
  }

  // Le plateau Legacy est rendu en entier, ligne par ligne : la case (x, y)
  // est le .cell d'index y * width + x.
  async function tap(cell) {
    const el = wrapper.findAll(".cell")[cell.y * wrapper.vm.game.width + cell.x]
    await el.trigger("pointerdown")
    await el.trigger("click")
  }

  const cellsOf = () => [...wrapper.vm.game.cells.values()].flat()

  it("victoire : temps local, soumission en ligne, succès et bannière", async () => {
    await startBeginner()

    // 1er coup n'importe où (le moteur garantit une ouverture sûre), puis
    // toutes les cases sans mine.
    await tap(cellsOf()[0])
    for (let guard = 0; wrapper.vm.game.status === "playing"; guard++) {
      expect(guard).toBeLessThan(200)
      await tap(cellsOf().find((cell) => !cell.isMine && !cell.revealed))
    }
    await flushPromises()

    expect(wrapper.vm.game.status).toBe("won")
    const banner = wrapper.find(".win-banner")
    expect(banner.text()).toContain("YOU WIN")
    expect(banner.text()).toContain("NEW BEST!")
    expect(banner.text()).toMatch(/TIME \d\d:\d\d\.\d\d/)

    const best = JSON.parse(
      localStorage.getItem("hibol-minesweeper:legacy-best-times"),
    )
    expect(best.beginner).toHaveLength(1)

    const submission = fetchMock.mock.calls.find(
      ([url]) => url === SUBMISSIONS_URL,
    )
    const body = JSON.parse(submission[1].body)
    expect(body).toMatchObject({
      difficulty: "beginner",
      seed: wrapper.vm.game.seed,
    })
    expect(body.moves).toEqual(wrapper.vm.legacyMoveLog.moves.value)
    expect(body.moves.every((move) => move.type === "reveal")).toBe(true)

    // Gagné sans aucun drapeau : Pro et Ultra Pro.
    expect(unlockedAchievements.value.pro).toBeTruthy()
    expect(unlockedAchievements.value["ultra-pro"]).toBeTruthy()
  })

  it("défaite : pas de bannière ni de soumission, une défaite comptée", async () => {
    await startBeginner()

    await tap(cellsOf()[0])
    await tap(cellsOf().find((cell) => cell.isMine))
    await flushPromises()

    expect(wrapper.vm.game.status).toBe("lost")
    expect(wrapper.find(".win-banner").exists()).toBe(false)
    expect(fetchMock.mock.calls.some(([url]) => url === SUBMISSIONS_URL)).toBe(
      false,
    )
    expect(localStorage.getItem("hibol-minesweeper:legacy-losses")).toBe("1")
    expect(localStorage.getItem("hibol-minesweeper:legacy-best-times")).toBe(
      null,
    )
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

describe("App.vue — Give Up (Infini) soumet la run au classement en ligne", () => {
  it("envoie le payload exact au nouvel endpoint sans jamais retarder la bannière de fin de run", async () => {
    localStorage.setItem(K.infiniteUnlocked, "true")
    localStorage.setItem(K.lastMode, "infinite")
    await mountApp()

    // Résolue seulement en fin de test : si onGiveUp attendait cet appel, la
    // bannière n'apparaîtrait pas avant — c'est ce qui prouve le caractère
    // non-bloquant. Libérée ensuite, sinon le verrou de réclamation
    // (accountOnline.js) resterait pris pour les tests suivants.
    let answer
    const fetchMock = vi.fn(
      () =>
        new Promise((resolve) => {
          answer = resolve
        }),
    )
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

    answer({ ok: true, json: () => Promise.resolve({ accepted: true }) })
    await flushPromises()
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

describe("App.vue — pseudo à choisir (dialogue « nouveau pseudo »)", () => {
  beforeEach(() => {
    usernamePrompted.value = true
    // Aucun appel réseau réel au boot (relecture du pseudo, files d'attente).
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("offline"))),
    )
  })

  afterEach(() => {
    usernamePrompted.value = false
    clearUsernameChoice()
  })

  it("partie en cours : pas de dialogue, il s'ouvre à la fin de la partie", async () => {
    await mountApp()
    await wrapper.find(".cell").trigger("click")
    expect(wrapper.vm.game.status).toBe("playing")
    expect(wrapper.vm.game.revealedCount).toBeGreaterThan(0)

    requireUsernameChoice("taken", "test")
    await flushPromises()
    expect(wrapper.find(".username-overlay").exists()).toBe(false)

    wrapper.vm.game.status = "lost"
    await flushPromises()
    expect(wrapper.find(".username-overlay").text()).toContain(
      '"test" is already taken online',
    )
  })

  it("au démarrage, sans partie commencée : dialogue tout de suite", async () => {
    requireUsernameChoice("account_gone", "test")

    await mountApp()

    expect(wrapper.find(".username-overlay").text()).toContain(
      "no longer exists",
    )
  })

  it("nom choisi : dialogue fermé, état effacé", async () => {
    requireUsernameChoice("taken", "test")
    await mountApp()
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ username: "nouveau" }),
        }),
      ),
    )

    await wrapper.find(".username-input").setValue("nouveau")
    await wrapper.find(".username-box .pixel-btn").trigger("click")
    await flushPromises()
    await wrapper.find(".username-box .pixel-btn").trigger("click") // OK
    await flushPromises()

    expect(usernameChoice.value).toBeNull()
    expect(wrapper.find(".username-overlay").exists()).toBe(false)
  })
})

describe("App.vue — messages « verrouillé » et introductions", () => {
  const INTRO_KEYS = {
    infinite: "hibol-minesweeper:seen-infinite-intro",
    treasure: "hibol-minesweeper:seen-treasure-intro",
  }

  const modeButton = (label) =>
    wrapper.findAll(".mode-btn").find((b) => b.text().includes(label))

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

  const modeButton = (label) =>
    wrapper.findAll(".mode-btn").find((b) => b.text().includes(label))

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

  const modeButton = (label) =>
    wrapper.findAll(".mode-btn").find((b) => b.text().includes(label))
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
