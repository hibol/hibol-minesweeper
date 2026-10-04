// @vitest-environment jsdom

import { describe, it, expect, afterEach } from "vitest"
import { mount, enableAutoUnmount } from "@vue/test-utils"
import InfiniteRunsPage from "./InfiniteRunsPage.vue"

// Les autres cas (classement en ligne, top local, v-model) passent par le
// menu entier : cf. BurgerMenu.test.js.

const TOP_RUNS_KEY = "hibol-minesweeper:infinite-top-runs"

enableAutoUnmount(afterEach)

afterEach(() => {
  localStorage.clear()
})

function run(revealedCount, distance, timestamp) {
  return {
    revealedCount,
    distance,
    minesTriggeredCount: 0,
    seed: timestamp,
    timestamp,
  }
}

const cellsOf = (wrapper) =>
  wrapper
    .findAll(".run-row")
    .map((row) => row.find('[aria-label^="Cells:"]').attributes("aria-label"))

describe("InfiniteRunsPage — tri du top local", () => {
  it("re-trie par le critère choisi, re-cliquer inverse l'ordre", async () => {
    localStorage.setItem(
      TOP_RUNS_KEY,
      JSON.stringify([run(300, 10, 1), run(200, 50, 2), run(100, 30, 3)]),
    )
    const wrapper = mount(InfiniteRunsPage, {
      props: { infiniteUnlocked: true },
    })
    const distanceChip = wrapper
      .findAll(".sort-chip")
      .find((b) => b.text() === "Distance")

    await distanceChip.trigger("click")
    expect(cellsOf(wrapper)).toEqual(["Cells: 200", "Cells: 100", "Cells: 300"])

    await distanceChip.trigger("click")
    expect(cellsOf(wrapper)).toEqual(["Cells: 300", "Cells: 100", "Cells: 200"])
  })
})

describe("InfiniteRunsPage — PLAY A SEED", () => {
  it("émet la seed saisie, en nombre, puis vide le champ", async () => {
    const wrapper = mount(InfiniteRunsPage, {
      props: { infiniteUnlocked: true },
    })
    const input = wrapper.find(".seed-input")

    await input.setValue("172837465")
    await wrapper.find(".seed-form").trigger("submit")

    expect(wrapper.emitted("start-infinite-with-seed")).toEqual([[172837465]])
    expect(input.element.value).toBe("")
  })

  it("Infini verrouillé : champ et bouton désactivés", () => {
    const wrapper = mount(InfiniteRunsPage, {
      props: { infiniteUnlocked: false },
    })

    expect(wrapper.find(".seed-input").attributes("disabled")).toBeDefined()
    expect(
      wrapper.find('.seed-form button[type="submit"]').attributes("disabled"),
    ).toBeDefined()
  })
})
