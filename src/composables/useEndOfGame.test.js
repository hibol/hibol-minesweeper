// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { ref, effectScope, nextTick } from "vue"
import { createGame, createInfiniteGame, createLegacyGame } from "../game/game"
import { loadTopRuns } from "../state/runHistory"
import { submitInfiniteRun } from "../state/infiniteOnline"
import {
  unlockAchievement,
  unlockedAchievements,
  currentAchievementBanner,
  dismissAchievementBanner,
  resumeAchievementBanners,
} from "../state/achievements"
import { useEndOfGame } from "./useEndOfGame"

vi.mock("../state/infiniteOnline", async (importOriginal) => ({
  ...(await importOriginal()),
  submitInfiniteRun: vi.fn(),
}))

// Les parcours complets (bannières à l'écran, clics, Give Up de bout en bout)
// sont dans App.endgame.integration.test.js. Ici : les ordres d'appel, les
// minuteries et les gardes de mode.

const KEY = "hibol-minesweeper:infinite-unlocked"
let scope

function setup(game = createGame(10, 10, 20)) {
  const gameRef = ref(game)
  scope = effectScope()
  const api = scope.run(() => useEndOfGame(gameRef))
  return { gameRef, ...api }
}

// Fait passer la partie courante au statut donné et laisse tourner les watch
// (flush "pre" : ils partent dans une micro-tâche, pas à l'affectation).
async function setStatus(gameRef, status) {
  gameRef.value.status = status
  await nextTick()
}

// Infini déjà débloqué, sans minuterie parasite : jsdom programme un timer
// (événement `storage`) à chaque localStorage.setItem, que les faux minuteurs
// captent et qui fausserait vi.getTimerCount().
function alreadyUnlocked() {
  localStorage.setItem(KEY, "true")
  vi.clearAllTimers()
}

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
  submitInfiniteRun.mockClear()
})

afterEach(() => {
  scope?.stop()
  vi.useRealTimers()
  // Singletons de module que localStorage.clear() ne remet pas à zéro.
  resumeAchievementBanners()
  while (currentAchievementBanner.value) {
    dismissAchievementBanner()
  }
  unlockedAchievements.value = {}
})

describe("useEndOfGame — déblocage de l'Infini", () => {
  it("part de la clé de stockage", () => {
    expect(setup().infiniteUnlocked.value).toBe(false)
    scope.stop()

    localStorage.setItem(KEY, "true")
    expect(setup().infiniteUnlocked.value).toBe(true)
  })

  it("1re victoire Classic : débloque, persiste et marque « juste débloqué »", async () => {
    const { gameRef, infiniteUnlocked, justUnlockedInfinite, showWinBanner } =
      setup()

    await setStatus(gameRef, "won")

    expect(infiniteUnlocked.value).toBe(true)
    expect(localStorage.getItem(KEY)).toBe("true")
    expect(justUnlockedInfinite.value).toBe(true)
    expect(showWinBanner.value).toBe(true)
  })

  it("victoire suivante : bannière, mais plus « juste débloqué »", async () => {
    localStorage.setItem(KEY, "true")
    const { gameRef, justUnlockedInfinite, showWinBanner } = setup()

    await setStatus(gameRef, "won")

    expect(showWinBanner.value).toBe(true)
    expect(justUnlockedInfinite.value).toBe(false)
  })

  it("une victoire hors Classic ne débloque rien et n'affiche rien", async () => {
    const { gameRef, infiniteUnlocked, showWinBanner } = setup(
      createLegacyGame("beginner"),
    )

    await setStatus(gameRef, "won")

    expect(infiniteUnlocked.value).toBe(false)
    expect(localStorage.getItem(KEY)).toBeNull()
    expect(showWinBanner.value).toBe(false)
  })

  it("une partie neuve (statut inchangé) ne rejoue pas la victoire", async () => {
    const { gameRef, showWinBanner, dismissWinBanner } = setup()
    await setStatus(gameRef, "won")
    dismissWinBanner()

    // Remplacement par une autre partie « won » : même statut, pas de watch.
    const other = createGame(10, 10, 20)
    other.status = "won"
    gameRef.value = other
    await nextTick()

    expect(showWinBanner.value).toBe(false)
  })
})

describe("useEndOfGame — bannière de victoire", () => {
  it("se ferme seule à 3 s, pas avant", async () => {
    const { gameRef, showWinBanner, justUnlockedInfinite } = setup()
    await setStatus(gameRef, "won")

    vi.advanceTimersByTime(2999)
    expect(showWinBanner.value).toBe(true)

    vi.advanceTimersByTime(1)
    expect(showWinBanner.value).toBe(false)
    expect(justUnlockedInfinite.value).toBe(false)
  })

  it("tient la file d'achievements, la relâche à la fermeture", async () => {
    const { gameRef, dismissWinBanner } = setup()
    await setStatus(gameRef, "won")

    unlockAchievement("hearty")
    expect(currentAchievementBanner.value).toBeNull()

    dismissWinBanner()
    expect(currentAchievementBanner.value?.id).toBe("hearty")
  })

  it("fermée à la main, la minuterie de 3 s est annulée", async () => {
    alreadyUnlocked()
    const { gameRef, showWinBanner, dismissWinBanner } = setup()
    await setStatus(gameRef, "won")
    expect(vi.getTimerCount()).toBe(1)

    dismissWinBanner()

    expect(vi.getTimerCount()).toBe(0)
    expect(showWinBanner.value).toBe(false)
  })
})

describe("useEndOfGame — bannière d'achievement", () => {
  it("se ferme seule à 4,5 s", async () => {
    setup()

    unlockAchievement("hearty")
    await nextTick()
    vi.advanceTimersByTime(4499)
    expect(currentAchievementBanner.value).not.toBeNull()

    vi.advanceTimersByTime(1)
    expect(currentAchievementBanner.value).toBeNull()
  })

  it("le suivant de la file repart sur son propre délai", async () => {
    setup()

    unlockAchievement("hearty")
    unlockAchievement("techy")
    await nextTick()
    vi.advanceTimersByTime(4500)
    await nextTick()
    expect(currentAchievementBanner.value?.id).toBe("techy")

    vi.advanceTimersByTime(4499)
    expect(currentAchievementBanner.value).not.toBeNull()

    vi.advanceTimersByTime(1)
    expect(currentAchievementBanner.value).toBeNull()
  })
})

describe("useEndOfGame — achievement retiré puis rendu", () => {
  it("l'ancienne échéance est annulée : le revenant repart sur son propre délai", async () => {
    const { gameRef } = setup()
    unlockAchievement("hearty")
    await nextTick() // minuterie d'origine : 4,5 s

    await setStatus(gameRef, "won") // la victoire retire l'achievement
    await nextTick()
    vi.advanceTimersByTime(3000) // bannière fermée : l'achievement revient
    await nextTick()
    expect(currentAchievementBanner.value?.id).toBe("hearty")

    vi.advanceTimersByTime(1500) // 4,5 s depuis le début
    expect(currentAchievementBanner.value).not.toBeNull()

    vi.advanceTimersByTime(3000) // 4,5 s depuis son retour
    expect(currentAchievementBanner.value).toBeNull()
  })
})

describe("useEndOfGame — run Infini", () => {
  function infiniteGame() {
    const game = createInfiniteGame(7)
    game.revealedCount = 321
    game.maxDistance = 45.6
    game.minesTriggeredCount = game.darknessMineThreshold + 2
    game.heartsCollectedCount = 1
    game.robotsTriggeredCount = 3
    game.usedMachines = true
    return game
  }

  it("perdue : run enregistrée avec ses compteurs, rang et bannière", async () => {
    const game = infiniteGame()
    const { gameRef, giveUpRank, showGiveUpBanner } = setup(game)
    const before = Date.now()

    await setStatus(gameRef, "lost")

    const [run] = loadTopRuns()
    expect(run).toMatchObject({
      revealedCount: 321,
      distance: 46,
      minesTriggeredCount: game.minesTriggeredCount,
      heartsCollectedCount: 1,
      robotsTriggeredCount: 3,
      usedMachines: true,
      machineUses: { windMachine: 0, travelMachine: 0, xrayMachine: 0 },
      seed: game.seed,
    })
    expect(run.timestamp).toBeGreaterThanOrEqual(before)
    expect(giveUpRank.value).toBe(1)
    expect(showGiveUpBanner.value).toBe(true)
  })

  it("dismissGiveUpBanner ferme la bannière", async () => {
    const { gameRef, showGiveUpBanner, dismissGiveUpBanner } =
      setup(infiniteGame())
    await setStatus(gameRef, "lost")

    dismissGiveUpBanner()

    expect(showGiveUpBanner.value).toBe(false)
  })

  it("une défaite hors Infini n'enregistre rien", async () => {
    const { gameRef, showGiveUpBanner } = setup()

    await setStatus(gameRef, "lost")

    expect(loadTopRuns()).toEqual([])
    expect(showGiveUpBanner.value).toBe(false)
  })

  it("onGiveUp : perd la partie et envoie la run en ligne", () => {
    const game = infiniteGame()
    const { onGiveUp } = setup(game)

    onGiveUp()

    expect(game.status).toBe("lost")
    expect(submitInfiniteRun).toHaveBeenCalledExactlyOnceWith({
      usedMachines: true,
      maxDistance: 45.6,
      revealedCount: 321,
      minesTriggered: game.minesTriggeredCount,
      heartsCollected: 1,
      robotsTriggered: 3,
      windMachineUses: 0,
      travelMachineUses: 0,
      xrayMachineUses: 0,
    })
  })

  it("onGiveUp sans assombrissement suffisant : rien ne change, rien ne part", () => {
    const game = createInfiniteGame(7)
    const { onGiveUp } = setup(game)

    onGiveUp()

    expect(game.status).toBe("playing")
    expect(submitInfiniteRun).not.toHaveBeenCalled()
  })
})

describe("useEndOfGame — démontage", () => {
  it("la minuterie de la bannière de victoire ne tourne plus", async () => {
    const { gameRef, showWinBanner } = setup()
    await setStatus(gameRef, "won")

    scope.stop()
    vi.advanceTimersByTime(10_000)

    expect(showWinBanner.value).toBe(true)
  })

  it("la minuterie de la bannière d'achievement ne tourne plus", async () => {
    setup()
    unlockAchievement("hearty")
    await nextTick()

    scope.stop()
    vi.advanceTimersByTime(10_000)

    expect(currentAchievementBanner.value).not.toBeNull()
  })
})
