// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { ref, effectScope } from "vue"
import { createGame, createLegacyGame } from "../game/game"
import { loadActiveGame } from "../state/gameStorage"
import { snapshotGameStorage } from "../state/storageReset"
import { currentToast, clearToasts } from "../state/toastQueue"
import { useGamePersistence } from "./useGamePersistence"

// Le parcours complet (onglet masqué, reset, import dans l'app montée) est
// dans App.persistence.integration.test.js. Ici : le contrat du composable.

let scope

const PLAYER = "00000000-0000-4000-8000-000000000001"
const OTHER_PLAYER = "00000000-0000-4000-8000-000000000002"

function setup(game = createGame(10, 10, 20)) {
  const gameRef = ref(game)
  const deps = {
    originX: ref(3),
    originY: ref(-2),
    cellSize: ref(20),
    suspendLegacy: vi.fn(),
    legacySnapshotExtras: vi.fn(() => ({ legacyElapsedMs: 1234 })),
    resumeLegacyIfPlaying: vi.fn(),
    treasurePause: vi.fn(),
    treasureResume: vi.fn(),
    persistTreasureGame: vi.fn(),
    retryOnlineQueues: vi.fn(),
    pushProgress: vi.fn(),
  }
  scope = effectScope()
  const api = scope.run(() => useGamePersistence(gameRef, deps))
  return { gameRef, deps, ...api }
}

function setVisibility(state) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  })
  document.dispatchEvent(new Event("visibilitychange"))
}

// Une partie classic avec une case ouverte : saveActiveGame garde le slot.
function playedClassic() {
  const game = createGame(10, 10, 20)
  game.status = "playing"
  return game
}

beforeEach(() => {
  localStorage.clear()
  clearToasts()
})

afterEach(() => {
  scope?.stop()
  vi.unstubAllGlobals()
  delete document.visibilityState
})

describe("useGamePersistence — persistActiveGame", () => {
  it("classic : snapshot écrit avec la caméra", () => {
    const { persistActiveGame } = setup(playedClassic())

    persistActiveGame()

    expect(loadActiveGame("classic").camera).toEqual({
      originX: 3,
      originY: -2,
      cellSize: 20,
    })
  })

  it("legacy : chrono suspendu avant la sauvegarde, extras dans le snapshot", () => {
    const game = createLegacyGame("beginner", 42)
    game.status = "playing"
    const { persistActiveGame, deps } = setup(game)
    deps.suspendLegacy.mockImplementation(() => {
      // Les extras doivent être lus après la suspension.
      expect(deps.legacySnapshotExtras).not.toHaveBeenCalled()
    })

    persistActiveGame()

    expect(deps.suspendLegacy).toHaveBeenCalledOnce()
    expect(loadActiveGame("legacy").legacyElapsedMs).toBe(1234)
  })

  it("classic : ni chrono Legacy ni extras", () => {
    const { persistActiveGame, deps } = setup(playedClassic())

    persistActiveGame()

    expect(deps.suspendLegacy).not.toHaveBeenCalled()
    expect(deps.legacySnapshotExtras).not.toHaveBeenCalled()
  })

  it("trésor : pause puis persistance du jour, aucun slot par mode", () => {
    const { persistActiveGame, deps, gameRef } = setup()
    gameRef.value = { mode: "treasure", status: "playing" }

    persistActiveGame()

    expect(deps.treasurePause).toHaveBeenCalledOnce()
    expect(deps.persistTreasureGame).toHaveBeenCalledOnce()
    expect(deps.treasurePause.mock.invocationCallOrder[0]).toBeLessThan(
      deps.persistTreasureGame.mock.invocationCallOrder[0],
    )
    expect(loadActiveGame("treasure")).toBeNull()
    expect(loadActiveGame("classic")).toBeNull()
  })
})

describe("useGamePersistence — listeners", () => {
  it("rien n'écoute avant attachListeners", () => {
    const { deps } = setup(playedClassic())

    window.dispatchEvent(new Event("pagehide"))
    window.dispatchEvent(new Event("online"))

    expect(loadActiveGame("classic")).toBeNull()
    expect(deps.retryOnlineQueues).not.toHaveBeenCalled()
  })

  it("onglet masqué : sauvegarde ; visible : relance Trésor et Legacy", () => {
    const { attachListeners, deps } = setup(playedClassic())
    attachListeners()

    setVisibility("hidden")
    expect(loadActiveGame("classic")).not.toBeNull()
    expect(deps.treasureResume).not.toHaveBeenCalled()

    setVisibility("visible")
    expect(deps.treasureResume).toHaveBeenCalledOnce()
    expect(deps.resumeLegacyIfPlaying).toHaveBeenCalledOnce()
  })

  it("onglet masqué ou pagehide : le score Infini est poussé (keepalive), pas au retour", () => {
    const { attachListeners, deps } = setup(playedClassic())
    attachListeners()

    setVisibility("hidden")
    expect(deps.pushProgress).toHaveBeenCalledTimes(1)
    expect(deps.pushProgress).toHaveBeenLastCalledWith({ keepalive: true })

    setVisibility("visible")
    expect(deps.pushProgress).toHaveBeenCalledTimes(1)

    window.dispatchEvent(new Event("pagehide"))
    expect(deps.pushProgress).toHaveBeenCalledTimes(2)
    expect(deps.pushProgress).toHaveBeenLastCalledWith({ keepalive: true })
  })

  it("rien n'est poussé avant attachListeners ni après le détachement", () => {
    const { attachListeners, detachPersistenceListeners, deps } =
      setup(playedClassic())

    window.dispatchEvent(new Event("pagehide"))
    attachListeners()
    detachPersistenceListeners()
    window.dispatchEvent(new Event("pagehide"))
    setVisibility("hidden")

    expect(deps.pushProgress).not.toHaveBeenCalled()
  })

  it("pagehide sauvegarde, online relance les renvois", () => {
    const { attachListeners, deps } = setup(playedClassic())
    attachListeners()

    window.dispatchEvent(new Event("pagehide"))
    window.dispatchEvent(new Event("online"))

    expect(loadActiveGame("classic")).not.toBeNull()
    expect(deps.retryOnlineQueues).toHaveBeenCalledOnce()
  })

  it("detachPersistenceListeners coupe la sauvegarde mais pas online", () => {
    const { attachListeners, detachPersistenceListeners, deps } =
      setup(playedClassic())
    attachListeners()

    detachPersistenceListeners()
    window.dispatchEvent(new Event("pagehide"))
    setVisibility("hidden")
    window.dispatchEvent(new Event("online"))

    expect(loadActiveGame("classic")).toBeNull()
    expect(deps.retryOnlineQueues).toHaveBeenCalledOnce()
  })

  it("fin du scope : plus aucun listener", () => {
    const { attachListeners, deps } = setup(playedClassic())
    attachListeners()

    scope.stop()
    window.dispatchEvent(new Event("pagehide"))
    window.dispatchEvent(new Event("online"))
    setVisibility("visible")

    expect(loadActiveGame("classic")).toBeNull()
    expect(deps.retryOnlineQueues).not.toHaveBeenCalled()
    expect(deps.treasureResume).not.toHaveBeenCalled()
  })
})

describe("useGamePersistence — reset et import", () => {
  // reload() simulé comme le vrai : il déclenche pagehide.
  function stubReload() {
    const reload = vi.fn(() => window.dispatchEvent(new Event("pagehide")))
    vi.stubGlobal("location", { ...window.location, reload })
    return reload
  }

  it("resetEverything efface tout et recharge sans réécrire la partie", () => {
    const { attachListeners, resetEverything } = setup(playedClassic())
    attachListeners()
    localStorage.setItem("hibol-minesweeper:hibol-balance", "12")
    localStorage.setItem("autre-app", "x")
    const reload = stubReload()

    resetEverything({ keepOnlineAccount: false })

    expect(reload).toHaveBeenCalledOnce()
    expect(loadActiveGame("classic")).toBeNull()
    expect(localStorage.getItem("hibol-minesweeper:hibol-balance")).toBeNull()
    expect(localStorage.getItem("autre-app")).toBe("x")
  })

  it("onImportSave remplace le stockage par les seules clés préfixées", () => {
    const { attachListeners, onImportSave } = setup(playedClassic())
    attachListeners()
    localStorage.setItem("hibol-minesweeper:hibol-balance", "12")
    const reload = stubReload()

    onImportSave({
      "hibol-minesweeper:infinite-unlocked": "true",
      "intrus:cle": "y",
    })

    expect(reload).toHaveBeenCalledOnce()
    expect(localStorage.getItem("hibol-minesweeper:infinite-unlocked")).toBe(
      "true",
    )
    expect(localStorage.getItem("hibol-minesweeper:hibol-balance")).toBeNull()
    expect(localStorage.getItem("intrus:cle")).toBeNull()
    expect(loadActiveGame("classic")).toBeNull()
  })

  describe("onImportSave — écriture refusée", () => {
    // Quota plein simulé : seule la clé « trop grosse » du fichier est refusée.
    function refuseKey(badKey) {
      const real = Storage.prototype.setItem
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(
        function (key, value) {
          if (key === badKey) {
            throw new DOMException("quota", "QuotaExceededError")
          }
          return real.call(this, key, value)
        },
      )
    }

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it("remet la progression d'avant, prévient, et ne recharge pas", () => {
      const { attachListeners, onImportSave } = setup(playedClassic())
      attachListeners()
      localStorage.setItem("hibol-minesweeper:hibol-balance", "12")
      localStorage.setItem("hibol-minesweeper:player-id", PLAYER)
      const before = snapshotGameStorage()
      const reload = stubReload()
      refuseKey("hibol-minesweeper:gros")

      onImportSave({
        "hibol-minesweeper:hibol-balance": "999",
        "hibol-minesweeper:gros": "x".repeat(100),
      })

      expect(reload).not.toHaveBeenCalled()
      expect(snapshotGameStorage().sort()).toEqual(before.sort())
      expect(currentToast.value.text).toMatch(/Import failed/)
    })

    it("la sauvegarde de la partie reprend après l'échec", () => {
      const { attachListeners, onImportSave } = setup(playedClassic())
      attachListeners()
      stubReload()
      refuseKey("hibol-minesweeper:gros")

      onImportSave({ "hibol-minesweeper:gros": "x" })
      vi.restoreAllMocks()
      window.dispatchEvent(new Event("pagehide"))

      expect(loadActiveGame("classic")).not.toBeNull()
    })

    it("aucune fusion d'identité n'est mise en file", () => {
      const { onImportSave } = setup(playedClassic())
      stubReload()
      refuseKey("hibol-minesweeper:gros")

      onImportSave({
        "hibol-minesweeper:player-id": OTHER_PLAYER,
        "hibol-minesweeper:gros": "x",
      })

      expect(
        localStorage.getItem("hibol-minesweeper:pending-identity-merges"),
      ).toBeNull()
    })
  })
})
