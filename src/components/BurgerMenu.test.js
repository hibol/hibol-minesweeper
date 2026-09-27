// @vitest-environment jsdom
// BurgerMenu.vue importe plusieurs modules d'état qui lisent localStorage à
// l'import (shop.js, settings.js, achievements.js...) — jsdom requis, même
// raison que shop.test.js.

import { describe, it, expect, afterEach, vi } from "vitest"
import { mount, flushPromises } from "@vue/test-utils"
import BurgerMenu from "./BurgerMenu.vue"

const LEADERBOARD_BASE =
  "https://hibol-minesweeper-api.chez-miette.xyz/api/infinite/leaderboard"

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

function jsonResponse(body) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(body) })
}

// Entrée de classement en ligne complète (V4 côté serveur : maxDistance/
// revealedCount/mines/hearts/robots, plus la métrique triée `value`).
function onlineEntry(overrides) {
  return {
    username: "alice",
    value: 900.5,
    maxDistance: 900.5,
    revealedCount: 51200,
    minesTriggered: 2,
    heartsCollected: 0,
    robotsTriggered: 0,
    submittedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  }
}

async function openInfiniteRuns(fetchMock) {
  vi.stubGlobal("fetch", fetchMock)
  const wrapper = mount(BurgerMenu, {
    props: { infiniteUnlocked: true, devUnlocked: false },
  })
  await wrapper.find(".menu-btn").trigger("click")
  const navItem = wrapper
    .findAll(".nav-item")
    .find((b) => b.text() === "INFINITE RUNS")
  await navItem.trigger("click")
  const onlineChip = wrapper
    .findAll(".sort-chip")
    .find((b) => b.text() === "Online")
  await onlineChip.trigger("click")
  await flushPromises()
  return wrapper
}

describe("BurgerMenu — INFINITE RUNS (online)", () => {
  it("charge distance/clean par défaut et affiche le rang comme position dans la liste", async () => {
    const fetchMock = vi.fn(() =>
      jsonResponse([
        onlineEntry({ username: "alice", value: 900.5, maxDistance: 900.5 }),
        onlineEntry({
          username: "bob",
          value: 500.1,
          maxDistance: 500.1,
          revealedCount: 30000,
          submittedAt: "2026-01-02T00:00:00Z",
        }),
      ]),
    )

    const wrapper = await openInfiniteRuns(fetchMock)

    expect(fetchMock).toHaveBeenCalledWith(
      `${LEADERBOARD_BASE}?metric=distance&category=clean&limit=50`,
    )

    const rows = wrapper.findAll(".run-row")
    expect(rows[0].text()).toContain("#1")
    expect(rows[0].text()).toContain("alice")
    expect(rows[0].text()).toContain("51200 cells")
    expect(rows[0].text()).toContain("901 distance")
    expect(rows[0].text()).toContain("2")
    expect(rows[1].text()).toContain("#2")
    expect(rows[1].text()).toContain("bob")
    expect(rows[1].text()).toContain("30000 cells")
  })

  it("les 4 combinaisons metric/category déclenchent chacune leur propre fetch", async () => {
    const fetchMock = vi.fn(() => jsonResponse([]))
    const wrapper = await openInfiniteRuns(fetchMock)

    async function clickChip(label) {
      const chip = wrapper
        .findAll(".sort-chip")
        .find((b) => b.text() === label)
      await chip.trigger("click")
      await flushPromises()
    }

    await clickChip("Cells")
    expect(fetchMock).toHaveBeenLastCalledWith(
      `${LEADERBOARD_BASE}?metric=cells&category=clean&limit=50`,
    )

    await clickChip("Yes")
    expect(fetchMock).toHaveBeenLastCalledWith(
      `${LEADERBOARD_BASE}?metric=cells&category=assisted&limit=50`,
    )

    await clickChip("Distance")
    expect(fetchMock).toHaveBeenLastCalledWith(
      `${LEADERBOARD_BASE}?metric=distance&category=assisted&limit=50`,
    )

    // 1 fetch initial en basculant sur Online (distance/clean) + les 3 clics
    // ci-dessus.
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it("échec réseau : état d'erreur affiché, jamais de crash", async () => {
    const fetchMock = vi.fn(() => Promise.reject(new Error("offline")))
    const wrapper = await openInfiniteRuns(fetchMock)

    expect(wrapper.text()).toContain("Couldn't load")
  })
})

describe("BurgerMenu — INFINITE RUNS (local)", () => {
  it("s'ouvre par défaut sur Local (top perso, aucun fetch réseau)", async () => {
    localStorage.setItem(
      "hibol-minesweeper:infinite-top-runs",
      JSON.stringify([
        {
          revealedCount: 51200,
          distance: 842,
          minesTriggeredCount: 3,
          heartsCollectedCount: 0,
          robotsTriggeredCount: 0,
          seed: 172837465,
          timestamp: 1735689600000,
        },
      ]),
    )
    const fetchMock = vi.fn(() => jsonResponse([]))
    vi.stubGlobal("fetch", fetchMock)

    const wrapper = mount(BurgerMenu, {
      props: { infiniteUnlocked: true, devUnlocked: false },
    })
    await wrapper.find(".menu-btn").trigger("click")
    const navItem = wrapper
      .findAll(".nav-item")
      .find((b) => b.text() === "INFINITE RUNS")
    await navItem.trigger("click")

    expect(fetchMock).not.toHaveBeenCalled()
    const row = wrapper.find(".run-row")
    expect(row.text()).toContain("51200 cells")
    expect(row.text()).toContain("842 distance")
    expect(row.text()).toContain("seed 172837465")
  })
})
