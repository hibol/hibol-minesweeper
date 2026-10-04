// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { mount } from "@vue/test-utils"
import { h } from "vue"
import RunStatIcons from "./RunStatIcons.vue"

// Racine multiple (fragment) : on l'enveloppe pour pouvoir interroger le rendu.
function mountStats(props) {
  return mount({ render: () => h("div", [h(RunStatIcons, props)]) })
}

const labels = (wrapper) =>
  wrapper.findAll('[role="img"]').map((el) => el.attributes("aria-label"))

describe("RunStatIcons", () => {
  it("affiche cellules, distance et mines, sans libellé visible", () => {
    const wrapper = mountStats({
      revealedCount: 1234,
      distance: 87,
      minesTriggered: 2,
    })
    expect(labels(wrapper)).toEqual(["Cells: 1234", "Distance: 87", "Mines: 2"])
    expect(wrapper.text()).not.toMatch(/cells|distance|mines/i)
    const cells = wrapper.find('[aria-label="Cells: 1234"]')
    expect(cells.attributes("title")).toBe("Cells: 1234")
    expect(cells.text()).toBe("1234")
  })

  it("cœurs et robots seulement s'ils sont non nuls", () => {
    const wrapper = mountStats({
      revealedCount: 10,
      distance: 3,
      minesTriggered: 0,
      heartsCollected: 1,
      robotsTriggered: 4,
    })
    expect(labels(wrapper)).toEqual([
      "Cells: 10",
      "Distance: 3",
      "Mines: 0",
      "Hearts: 1",
      "Robots: 4",
    ])
  })
})
