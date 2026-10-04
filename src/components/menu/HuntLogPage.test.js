// @vitest-environment jsdom

import { describe, it, expect, afterEach } from "vitest"
import { mount, enableAutoUnmount } from "@vue/test-utils"
import HuntLogPage from "./HuntLogPage.vue"
import {
  treasureEntries,
  currentStreak,
  bestStreak,
} from "../../state/treasureLog"

enableAutoUnmount(afterEach)

afterEach(() => {
  treasureEntries.value = []
  currentStreak.value = 0
  bestStreak.value = 0
  localStorage.clear()
})

describe("HuntLogPage", () => {
  it("aucune chasse : message vide", () => {
    expect(mount(HuntLogPage).text()).toContain("No hunts yet")
  })

  it("en-tête : séries, trouvés et taux de réussite arrondi", () => {
    treasureEntries.value = [
      { dayKey: "20261003", outcome: "won", minesHit: 0, timeMs: 1000 },
      { dayKey: "20261002", outcome: "lost", minesHit: 3, timeMs: 1000 },
      { dayKey: "20261001", outcome: "lost", minesHit: 3, timeMs: 1000 },
    ]
    currentStreak.value = 3
    bestStreak.value = 5

    const header = mount(HuntLogPage).find(".hunt-log-header").text()

    expect(header).toContain("Streak 3")
    expect(header).toContain("Best 5")
    expect(header).toContain("Found 1")
    expect(header).toContain("Win rate 33%")
  })

  it("une ligne par jour : date, issue, mines, temps et récompense", () => {
    treasureEntries.value = [
      {
        dayKey: "20261004",
        outcome: "won",
        minesHit: 1,
        timeMs: 125000,
        reward: 4,
      },
      { dayKey: "20261003", outcome: "lost", minesHit: 3, timeMs: 60000 },
    ]

    const [won, lost] = mount(HuntLogPage).findAll(".run-row")

    expect(won.text()).toContain("2026-10-04")
    expect(won.find('[aria-label="Treasure found"]').exists()).toBe(true)
    expect(won.find('[aria-label="Mines hit: 1/3"]').exists()).toBe(true)
    expect(won.find('[aria-label="Time: 02:05"]').exists()).toBe(true)
    expect(won.text()).toContain("+4")
    expect(lost.find('[aria-label="Treasure missed"]').exists()).toBe(true)
    expect(lost.text()).not.toContain("+")
  })
})
