// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { mount } from "@vue/test-utils"
import TreasureBanner from "./TreasureBanner.vue"

// Lignes source (sans la ligne Total) : [libellé, montant, détail].
function rowsOf(wrapper) {
  const texts = (selector) => wrapper.findAll(selector).map((el) => el.text())
  const labels = texts(".reward-label").slice(0, -1)
  const amounts = texts(".reward-amount")
  const details = texts(".reward-detail")
  return labels.map((label, i) => [label, amounts[i], details[i]])
}

function mountBanner(props) {
  return mount(TreasureBanner, {
    props: { show: true, timeLabel: "04:12", ...props },
  })
}

describe("TreasureBanner — récapitulatif des gains", () => {
  it("victoire complète : Found, Chest avec la pénalité, Storm bonus, total", () => {
    const wrapper = mountBanner({
      variant: "won",
      found: 2,
      chest: 2,
      stormBonus: 1,
      minesHit: 1,
    })
    expect(wrapper.text()).toContain("YOU WIN")
    expect(rowsOf(wrapper)).toEqual([
      ["Found", "+2", ""],
      ["Chest", "+2", "3 − 1 mine"],
      ["Storm bonus", "+1", ""],
    ])
    expect(wrapper.find(".reward-total").text()).toBe("+5")
    expect(wrapper.text()).toContain("Time 04:12")
  })

  it("victoire sans trouvaille ni tornade : seule la ligne Chest, sans détail à 0 mine", () => {
    const wrapper = mountBanner({ variant: "won", chest: 3, minesHit: 0 })
    expect(rowsOf(wrapper)).toEqual([["Chest", "+3", ""]])
    expect(wrapper.find(".reward-total").text()).toBe("+3")
  })

  it("victoire à 2 mines : pluriel dans le détail", () => {
    const wrapper = mountBanner({ variant: "won", chest: 1, minesHit: 2 })
    expect(rowsOf(wrapper)).toEqual([["Chest", "+1", "3 − 2 mines"]])
  })

  it("défaite avec trouvailles : Found et total, jamais le coffre", () => {
    const wrapper = mountBanner({
      variant: "lost",
      found: 2,
      chest: 0,
      minesHit: 3,
    })
    expect(wrapper.text()).toContain("GAME OVER")
    expect(wrapper.text()).toContain("3 mines — the treasure got away")
    expect(rowsOf(wrapper)).toEqual([["Found", "+2", ""]])
    expect(wrapper.find(".reward-total").text()).toBe("+2")
  })

  it("défaite sans hibol : une seule ligne « No hibols today »", () => {
    const wrapper = mountBanner({ variant: "lost", minesHit: 3 })
    expect(wrapper.find(".reward-table").exists()).toBe(false)
    expect(wrapper.text()).toContain("No hibols today")
    expect(wrapper.text()).toContain("Time 04:12")
  })
})
