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

async function openInfiniteRanks(fetchMock) {
  vi.stubGlobal("fetch", fetchMock)
  const wrapper = mount(BurgerMenu, {
    props: { infiniteUnlocked: true, devUnlocked: false },
  })
  await wrapper.find(".menu-btn").trigger("click")
  const navItem = wrapper
    .findAll(".nav-item")
    .find((b) => b.text() === "INFINITE RANKS")
  await navItem.trigger("click")
  await flushPromises()
  return wrapper
}

describe("BurgerMenu — INFINITE RANKS", () => {
  it("charge distance/clean par défaut et affiche le rang comme position dans la liste", async () => {
    const fetchMock = vi.fn(() =>
      jsonResponse([
        {
          username: "alice",
          value: 900.5,
          submittedAt: "2026-01-01T00:00:00Z",
        },
        { username: "bob", value: 500.1, submittedAt: "2026-01-02T00:00:00Z" },
      ]),
    )

    const wrapper = await openInfiniteRanks(fetchMock)

    expect(fetchMock).toHaveBeenCalledWith(
      `${LEADERBOARD_BASE}?metric=distance&category=clean&limit=50`,
    )

    const rows = wrapper.findAll(".run-row")
    expect(rows[0].text()).toContain("#1")
    expect(rows[0].text()).toContain("alice")
    expect(rows[1].text()).toContain("#2")
    expect(rows[1].text()).toContain("bob")
  })

  it("les 4 combinaisons metric/category déclenchent chacune leur propre fetch", async () => {
    const fetchMock = vi.fn(() => jsonResponse([]))
    const wrapper = await openInfiniteRanks(fetchMock)

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

    await clickChip("Assisted")
    expect(fetchMock).toHaveBeenLastCalledWith(
      `${LEADERBOARD_BASE}?metric=cells&category=assisted&limit=50`,
    )

    await clickChip("Distance")
    expect(fetchMock).toHaveBeenLastCalledWith(
      `${LEADERBOARD_BASE}?metric=distance&category=assisted&limit=50`,
    )

    // 1 fetch initial à l'ouverture (distance/clean) + les 3 clics ci-dessus.
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it("échec réseau : état d'erreur affiché, jamais de crash", async () => {
    const fetchMock = vi.fn(() => Promise.reject(new Error("offline")))
    const wrapper = await openInfiniteRanks(fetchMock)

    expect(wrapper.text()).toContain("Couldn't load")
  })
})
