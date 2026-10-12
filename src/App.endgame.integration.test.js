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
import { revealCell, toggleFlag } from "./game/game"
import { inventory } from "./state/shop"
import { loadTopRuns } from "./state/runHistory"
import {
  unlockAchievement,
  unlockedAchievements,
  currentAchievementBanner,
  dismissAchievementBanner,
  resumeAchievementBanners,
} from "./state/achievements"

// Intégration d'App.vue : fins de partie (victoire Classic, run Infini
// abandonnée) et bannières d'achievement.

useAppHarness()

const TOP_RUNS_KEY = "hibol-minesweeper:infinite-top-runs"

// Faux minuteurs après le montage : flushPromises ne doit pas en dépendre.
// clearTimeout compris, sinon il n'annule pas les setTimeout factices.
function fakeTimers() {
  vi.useFakeTimers({
    toFake: [
      "setInterval",
      "clearInterval",
      "setTimeout",
      "clearTimeout",
      "performance",
    ],
  })
}

afterEach(() => {
  vi.useRealTimers()
  // Singletons de module que localStorage.clear() ne remet pas à zéro :
  // file « tenue » par une bannière de victoire, bannière en cours, déblocages.
  resumeAchievementBanners()
  while (currentAchievementBanner.value) {
    dismissAchievementBanner()
  }
  unlockedAchievements.value = {}
})

// Les plateaux Classic et Legacy sont rendus en entier, ligne par ligne : la
// case (x, y) est le .cell d'index y * width + x.
async function tap(cell) {
  const el = wrapper.findAll(".cell")[cell.y * wrapper.vm.game.width + cell.x]
  await el.trigger("pointerdown")
  await el.trigger("click")
}

const cellsOf = () => [...wrapper.vm.game.cells.values()]

describe("App.vue — victoire Classic", () => {
  // Ouvre tout le plateau sauf une case, puis gagne par un vrai clic sur elle.
  // La case cible est flaggée pendant l'ouverture du reste : une cascade saute
  // les cases flaggées, elle ne peut donc pas gagner à ma place.
  async function winByLastClick() {
    await tap(cellsOf()[0]) // 1er coup : le moteur garantit une ouverture sûre
    const game = wrapper.vm.game
    const target = cellsOf().find((cell) => !cell.isMine && !cell.revealed)

    toggleFlag(game, target)

    for (const cell of cellsOf()) {
      if (!cell.isMine && !cell.revealed && !cell.flagged) {
        revealCell(game, cell)
      }
    }
    await nextTick()
    expect(game.status).toBe("playing")
    expect(wrapper.find(".win-banner").exists()).toBe(false)

    toggleFlag(game, target)
    await tap(target)
    expect(game.status).toBe("won")
  }

  it("premier gain : bannière, Infini débloqué et persisté, pulsation, fermeture à 3 s", async () => {
    await mountApp()
    fakeTimers()

    expect(localStorage.getItem(K.infiniteUnlocked)).toBeNull()
    expect(modeButton("Infinite").classes()).toContain("locked")

    await winByLastClick()

    const banner = wrapper.find(".win-banner")
    expect(banner.text()).toContain("YOU WIN")
    expect(banner.text()).toContain("INFINITE MODE UNLOCKED")
    expect(localStorage.getItem(K.infiniteUnlocked)).toBe("true")
    expect(modeButton("Infinite").classes()).toContain("pulse")
    expect(modeButton("Infinite").classes()).not.toContain("locked")

    vi.advanceTimersByTime(2999)
    await nextTick()
    expect(wrapper.find(".win-banner").exists()).toBe(true)

    vi.advanceTimersByTime(1)
    await nextTick()
    expect(wrapper.find(".win-banner").exists()).toBe(false)
    expect(modeButton("Infinite").classes()).not.toContain("pulse")
    // Le déblocage, lui, reste.
    expect(localStorage.getItem(K.infiniteUnlocked)).toBe("true")
  })

  it("gain suivant : bannière simple, pas « juste débloqué », pas de pulsation", async () => {
    localStorage.setItem(K.infiniteUnlocked, "true")
    await mountApp()

    await winByLastClick()

    const banner = wrapper.find(".win-banner")
    expect(banner.text()).toContain("YOU WIN")
    expect(banner.text()).not.toContain("UNLOCKED")
    expect(modeButton("Infinite").classes()).not.toContain("pulse")
  })

  it("un clic sur la bannière la ferme avant les 3 s", async () => {
    await mountApp()
    await winByLastClick()

    await wrapper.find(".win-banner").trigger("click")

    expect(wrapper.find(".win-banner").exists()).toBe(false)
    expect(modeButton("Infinite").classes()).not.toContain("pulse")
  })

  it("un achievement débloqué pendant la bannière attend sa fermeture", async () => {
    await mountApp()
    await winByLastClick()

    unlockAchievement("hearty")
    await nextTick()
    expect(wrapper.find(".win-banner").exists()).toBe(true)
    expect(wrapper.find(".achievement-banner").exists()).toBe(false)

    await wrapper.find(".win-banner").trigger("click")
    expect(wrapper.find(".achievement-banner").text()).toContain("HEARTY")
  })

  it("un achievement déjà à l'écran cède la place à la victoire, puis revient", async () => {
    await mountApp()
    fakeTimers()

    unlockAchievement("hearty")
    await nextTick()
    expect(wrapper.find(".achievement-banner").exists()).toBe(true)

    await winByLastClick()
    expect(wrapper.find(".win-banner").exists()).toBe(true)
    expect(wrapper.find(".achievement-banner").exists()).toBe(false)

    vi.advanceTimersByTime(3000)
    await nextTick()
    expect(wrapper.find(".win-banner").exists()).toBe(false)
    expect(wrapper.find(".achievement-banner").text()).toContain("HEARTY")

    // Le minuteur d'origine (échéance à 4,5 s) a été annulé quand la bannière
    // a été retirée : l'achievement revenu repart sur son propre délai.
    vi.advanceTimersByTime(1500)
    await nextTick()
    expect(wrapper.find(".achievement-banner").exists()).toBe(true)

    vi.advanceTimersByTime(3000)
    await nextTick()
    expect(wrapper.find(".achievement-banner").exists()).toBe(false)
  })
})

describe("App.vue — les autres modes ne déclenchent pas les fins Classic / Infini", () => {
  it("Legacy gagné : l'Infini reste verrouillé, sans pulsation", async () => {
    inventory.value.legacyMode = 1
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ accepted: true, timeMs: null }),
        }),
      ),
    )
    await mountApp()
    await modeButton("Legacy").trigger("click")
    await wrapper
      .findAll(".legacy-menu-item")
      .find((b) => b.text() === "Beginner")
      .trigger("click")
    await flushPromises()

    await tap(cellsOf()[0])
    for (let guard = 0; wrapper.vm.game.status === "playing"; guard++) {
      expect(guard).toBeLessThan(200)
      await tap(cellsOf().find((cell) => !cell.isMine && !cell.revealed))
    }
    await flushPromises()

    expect(wrapper.vm.game.mode).toBe("legacy")
    expect(wrapper.vm.game.status).toBe("won")
    expect(localStorage.getItem(K.infiniteUnlocked)).toBeNull()
    expect(modeButton("Infinite").classes()).toContain("locked")
    expect(modeButton("Infinite").classes()).not.toContain("pulse")
  })

  it("Classic perdu sur une mine : ni bannière de fin de run, ni run Infini enregistrée", async () => {
    await mountApp()

    await tap(cellsOf()[0])
    await tap(cellsOf().find((cell) => cell.isMine))
    await flushPromises()

    expect(wrapper.vm.game.status).toBe("lost")
    expect(wrapper.find(".win-banner").exists()).toBe(false)
    expect(loadTopRuns()).toEqual([])
  })
})

describe("App.vue — bannière d'achievement", () => {
  it("se ferme seule à 4,5 s, pas avant, et ne réagit pas au clic", async () => {
    await mountApp()
    fakeTimers()

    unlockAchievement("hearty")
    await nextTick()
    expect(wrapper.find(".achievement-banner").exists()).toBe(true)

    await wrapper.find(".achievement-banner").trigger("click")
    expect(wrapper.find(".achievement-banner").exists()).toBe(true)

    vi.advanceTimersByTime(4499)
    await nextTick()
    expect(wrapper.find(".achievement-banner").exists()).toBe(true)

    vi.advanceTimersByTime(1)
    await nextTick()
    expect(wrapper.find(".achievement-banner").exists()).toBe(false)
  })

  it("enchaîne la file : le suivant démarre son propre délai de 4,5 s", async () => {
    await mountApp()
    fakeTimers()

    unlockAchievement("hearty")
    unlockAchievement("techy")
    await nextTick()
    expect(wrapper.find(".achievement-banner").text()).toContain("HEARTY")

    vi.advanceTimersByTime(4500)
    await nextTick()
    expect(wrapper.find(".achievement-banner").text()).toContain("TECHY")

    vi.advanceTimersByTime(4499)
    await nextTick()
    expect(wrapper.find(".achievement-banner").exists()).toBe(true)

    vi.advanceTimersByTime(1)
    await nextTick()
    expect(wrapper.find(".achievement-banner").exists()).toBe(false)
  })
})

describe("App.vue — Give Up (Infini) : run locale et bannière de fin", () => {
  async function mountInfinite() {
    localStorage.setItem(K.infiniteUnlocked, "true")
    localStorage.setItem(K.lastMode, "infinite")
    // Envoi en ligne : échec avalé, sans effet sur ce qu'on vérifie ici.
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("offline"))),
    )
    await mountApp()
  }

  function setRunCounters() {
    const game = wrapper.vm.game
    game.minesTriggeredCount = 20 // >= darknessMineThreshold : Give Up possible
    game.heartsCollectedCount = 4
    game.robotsTriggeredCount = 2
    game.maxDistance = 123.4
    game.revealedCount = 5000
  }

  const betterRuns = (count) =>
    Array.from({ length: count }, (_, i) => ({ revealedCount: 6000 + i }))

  it("enregistre la run avec ses compteurs et affiche son rang", async () => {
    await mountInfinite()
    setRunCounters()
    await nextTick()
    const before = Date.now()

    await wrapper.find(".give-up").trigger("click")
    await flushPromises()

    const runs = loadTopRuns()
    expect(runs).toHaveLength(1)
    expect(runs[0]).toMatchObject({
      revealedCount: 5000,
      distance: 123, // maxDistance arrondi
      minesTriggeredCount: 20,
      heartsCollectedCount: 4,
      robotsTriggeredCount: 2,
      seed: wrapper.vm.game.seed,
    })
    expect(runs[0].timestamp).toBeGreaterThanOrEqual(before)
    expect(runs[0].timestamp).toBeLessThanOrEqual(Date.now())

    const banner = wrapper.find(".win-banner")
    expect(banner.text()).toContain("GAME OVER")
    expect(banner.text()).toContain("5000")
    expect(banner.text()).toContain("123")
    expect(banner.text()).toContain("TOP 1 RUN!")
  })

  it.each([
    [1, "TOP 2 RUN!"],
    [10, null], // top plein de meilleures runs : la run n'y entre pas
  ])(
    "avec %i meilleure(s) run(s) déjà gardée(s) : %s",
    async (better, expected) => {
      localStorage.setItem(TOP_RUNS_KEY, JSON.stringify(betterRuns(better)))
      await mountInfinite()
      setRunCounters()
      await nextTick()

      await wrapper.find(".give-up").trigger("click")
      await flushPromises()

      const text = wrapper.find(".win-banner").text()

      expect(text).toContain("GAME OVER")

      if (expected) {
        expect(text).toContain(expected)
      } else {
        expect(text).not.toContain("TOP")
      }
    },
  )

  it("un clic sur la bannière la ferme", async () => {
    await mountInfinite()
    setRunCounters()
    await nextTick()
    await wrapper.find(".give-up").trigger("click")

    await wrapper.find(".win-banner").trigger("click")

    expect(wrapper.find(".win-banner").exists()).toBe(false)
  })

  it("sous le seuil d'obscurité : pas de bouton Give Up, aucune run enregistrée", async () => {
    await mountInfinite()
    wrapper.vm.game.minesTriggeredCount =
      wrapper.vm.game.darknessMineThreshold - 1
    await nextTick()

    expect(wrapper.find(".give-up").exists()).toBe(false)
    expect(wrapper.vm.game.status).toBe("playing")
    expect(loadTopRuns()).toEqual([])
  })
})
