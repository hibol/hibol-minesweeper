// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { flushPromises } from "@vue/test-utils"
import { inventory } from "./state/shop"
import { unlockedAchievements } from "./state/achievements"
import { useAppHarness, wrapper, mountApp } from "../test/appHarness"

// Intégration d'App.vue : fin de partie Legacy, de bout en bout.

useAppHarness()

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
