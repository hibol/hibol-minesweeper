// @vitest-environment jsdom

import { describe, it, expect, afterEach, vi } from "vitest"
import { mount, flushPromises, enableAutoUnmount } from "@vue/test-utils"
import LegacyTimesPage from "./LegacyTimesPage.vue"
import { legacyScores } from "../../state/legacyScores"

const LEADERBOARD_BASE =
  "https://hibol-minesweeper-api.chez-miette.xyz/api/legacy/leaderboard"

enableAutoUnmount(afterEach)

afterEach(() => {
  legacyScores.value = {}
  vi.unstubAllGlobals()
  localStorage.clear()
})

function jsonResponse(body) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(body) })
}

const chip = (wrapper, label) =>
  wrapper.findAll(".sort-chip").find((b) => b.text() === label)

const visibleRows = (wrapper) =>
  wrapper.findAll(".run-row").filter((row) => !row.classes("run-row-pad"))

describe("LegacyTimesPage — Local", () => {
  it("s'ouvre sur la 1re difficulté qui a des temps", () => {
    legacyScores.value = {
      beginner: [],
      intermediate: [],
      expert: [{ timeMs: 61230, name: "me", timestamp: 1 }],
    }

    const wrapper = mount(LegacyTimesPage)

    expect(chip(wrapper, "Expert").classes()).toContain("active")
    expect(visibleRows(wrapper)[0].text()).toContain("01:01.23")
    expect(visibleRows(wrapper)[0].text()).toContain("me")
  })

  it("réserve autant de lignes que la difficulté la plus fournie", async () => {
    legacyScores.value = {
      beginner: [{ timeMs: 9000, timestamp: 1 }],
      intermediate: [],
      expert: [1, 2, 3].map((i) => ({ timeMs: i * 1000, timestamp: i })),
    }
    const wrapper = mount(LegacyTimesPage)

    await chip(wrapper, "Beginner").trigger("click")

    expect(wrapper.findAll(".run-row")).toHaveLength(3)
    expect(visibleRows(wrapper)).toHaveLength(1)
  })
})

describe("LegacyTimesPage — Online", () => {
  it("charge la difficulté affichée, puis recharge à chaque changement", async () => {
    const fetchMock = vi.fn(() =>
      jsonResponse([
        { username: "alice", timeMs: 5000, submittedAt: "2026-01-01" },
      ]),
    )
    vi.stubGlobal("fetch", fetchMock)
    const wrapper = mount(LegacyTimesPage)

    await chip(wrapper, "Online").trigger("click")
    await flushPromises()
    expect(fetchMock).toHaveBeenLastCalledWith(
      `${LEADERBOARD_BASE}?difficulty=beginner&limit=50`,
    )
    expect(visibleRows(wrapper)[0].text()).toContain("alice")

    await chip(wrapper, "Expert").trigger("click")
    await flushPromises()
    expect(fetchMock).toHaveBeenLastCalledWith(
      `${LEADERBOARD_BASE}?difficulty=expert&limit=50`,
    )
  })

  it("toujours rechargé en revenant sur Online (pas de cache)", async () => {
    const fetchMock = vi.fn(() => jsonResponse([]))
    vi.stubGlobal("fetch", fetchMock)
    const wrapper = mount(LegacyTimesPage)

    await chip(wrapper, "Online").trigger("click")
    await chip(wrapper, "Local").trigger("click")
    await chip(wrapper, "Online").trigger("click")
    await flushPromises()

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("échec réseau : invite à réessayer via Online", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("offline"))),
    )
    const wrapper = mount(LegacyTimesPage)

    await chip(wrapper, "Online").trigger("click")
    await flushPromises()

    expect(wrapper.text()).toContain("Couldn't load — tap Online to retry")
  })
})
