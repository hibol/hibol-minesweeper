// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { mount } from "@vue/test-utils"
import { reactive } from "vue"
import MineCell from "./MineCell.vue"

// `cell` est réactif comme dans game.cells : le template écrit dedans.
function robotCell(props) {
  return reactive({
    x: 3,
    y: 4,
    revealed: true,
    flagged: false,
    isMine: false,
    neighborMines: 1,
    tiltDeg: 0,
    robotHere: true,
    robotPop: true,
    ...props,
  })
}

describe("MineCell — pop du robot", () => {
  it("pop à l'apparition, puis plus après animationend", async () => {
    const cell = robotCell()
    const wrapper = mount(MineCell, { props: { cell } })
    const icon = () => wrapper.find(".robot-icon")

    expect(icon().classes()).toContain("pop-in")

    await icon().trigger("animationend")

    expect(cell.robotPop).toBe(false)
    expect(icon().classes()).not.toContain("pop-in")
  })

  it("remonté après le pop : pas de nouveau pop", async () => {
    const cell = robotCell()
    const first = mount(MineCell, { props: { cell } })
    await first.find(".robot-icon").trigger("animationend")
    first.unmount()

    const second = mount(MineCell, { props: { cell } })

    expect(second.find(".robot-icon").classes()).not.toContain("pop-in")
  })

  it("un nouveau pas de découverte rejoue le pop", async () => {
    const cell = robotCell({ robotPop: false })
    const wrapper = mount(MineCell, { props: { cell } })

    cell.robotPop = true
    await wrapper.vm.$nextTick()

    expect(wrapper.find(".robot-icon").classes()).toContain("pop-in")
  })
})
