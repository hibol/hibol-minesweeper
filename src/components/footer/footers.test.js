// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { mount } from "@vue/test-utils"
import InfiniteFooter from "./InfiniteFooter.vue"
import TreasureFooter from "./TreasureFooter.vue"
import ClassicFooter from "./ClassicFooter.vue"
import LegacyFooter from "./LegacyFooter.vue"

const labels = (wrapper) =>
  wrapper.findAll('[role="img"]').map((el) => el.attributes("aria-label"))

describe("InfiniteFooter", () => {
  const game = (props) => ({
    revealedCount: 120,
    flaggedCount: 4,
    minesTriggeredCount: 1,
    heartsCollectedCount: 0,
    robotsTriggeredCount: 0,
    ...props,
  })

  function mountFooter(props) {
    return mount(InfiniteFooter, {
      props: { game: game(), dangerLevel: 0.3, ...props },
    })
  }

  it("barre de danger, puis cellules, drapeaux et mines", () => {
    const wrapper = mountFooter()

    expect(wrapper.element.tagName).toBe("FOOTER")
    expect(wrapper.classes()).toContain("app-footer")
    expect(wrapper.find(".danger-row").exists()).toBe(true)
    expect(labels(wrapper)).toEqual(["Cells: 120", "Flags: 4", "Mines: 1"])
  })

  it("la position s'intercale après les cellules, seulement si fournie", () => {
    const wrapper = mountFooter({
      position: { label: "x,y(3;-2)", description: "Position: 3, -2" },
    })

    expect(labels(wrapper)).toEqual([
      "Cells: 120",
      "Position: 3, -2",
      "Flags: 4",
      "Mines: 1",
    ])
    expect(wrapper.find(".stat-position").text()).toBe("x,y(3;-2)")
  })

  it("cœurs et robots seulement s'ils sont non nuls, avec leur « ? » sur demande", async () => {
    const wrapper = mountFooter({
      game: game({ heartsCollectedCount: 2, robotsTriggeredCount: 1 }),
      showHelpButton: true,
    })

    expect(labels(wrapper)).toEqual([
      "Cells: 120",
      "Flags: 4",
      "Mines: 1",
      "Hearts: 2",
      "Robots: 1",
    ])

    const [heartHelp, robotHelp] = wrapper.findAll(".help-btn")
    await heartHelp.trigger("click")
    await robotHelp.trigger("click")
    expect(wrapper.emitted("help")).toEqual([["heart"], ["robot"]])
  })

  it("pas de « ? » sans showHelpButton", () => {
    const wrapper = mountFooter({
      game: game({ heartsCollectedCount: 2 }),
    })

    expect(wrapper.find(".help-btn").exists()).toBe(false)
  })
})

describe("TreasureFooter", () => {
  const game = (props) => ({
    minesTriggeredCount: 1,
    unlimitedLives: false,
    hibolsCollectedCount: 0,
    tornadoCount: 0,
    ...props,
  })

  it("mines touchées sur 3, sans cœur de cible ni hibol à zéro", () => {
    const wrapper = mount(TreasureFooter, { props: { game: game() } })

    expect(wrapper.classes()).toContain("app-footer")
    expect(labels(wrapper)).toEqual(["Mines hit: 1/3"])
  })

  it("vies illimitées (DEV) : le compte seul", () => {
    const wrapper = mount(TreasureFooter, {
      props: { game: game({ unlimitedLives: true, minesTriggeredCount: 5 }) },
    })

    expect(labels(wrapper)).toEqual(["Mines hit: 5"])
  })

  it("hibols, tornades puis position, avec les « ? » correspondants", async () => {
    const wrapper = mount(TreasureFooter, {
      props: {
        game: game({ hibolsCollectedCount: 2, tornadoCount: 3 }),
        position: { label: "x,y(0;0)", description: "Position: 0, 0" },
        showHelpButton: true,
      },
    })

    expect(labels(wrapper)).toEqual([
      "Mines hit: 1/3",
      "Hibols: 2",
      "Tornadoes: 3",
      "Position: 0, 0",
    ])

    const [hibolHelp, tornadoHelp] = wrapper.findAll(".help-btn")
    await hibolHelp.trigger("click")
    await tornadoHelp.trigger("click")
    expect(wrapper.emitted("help")).toEqual([["hibol"], ["tornado"]])
  })
})

describe("ClassicFooter", () => {
  it("drapeaux posés sur nombre de mines", () => {
    const wrapper = mount(ClassicFooter, {
      props: { game: { flaggedCount: 7, mineCount: 20 } },
    })

    expect(wrapper.classes()).toContain("app-footer")
    expect(labels(wrapper)).toEqual(["Flags: 7/20"])
  })
})

describe("LegacyFooter", () => {
  function mountFooter(props) {
    return mount(LegacyFooter, {
      props: {
        game: { difficulty: "intermediate" },
        timeLabel: "01:23.45",
        minesLeft: 38,
        ...props,
      },
    })
  }

  it("chrono seul sur sa ligne, puis mines restantes et difficulté", () => {
    const wrapper = mountFooter()

    expect(wrapper.classes()).toContain("app-footer")
    expect(wrapper.find(".legacy-timer").text()).toBe("01:23.45")
    expect(labels(wrapper)).toEqual(["Mines left: 38"])
    expect(wrapper.find(".stats-row").text()).toContain("INTERMEDIATE")
  })

  it("mines restantes négatives (trop de drapeaux) : affichées telles quelles", () => {
    const wrapper = mountFooter({ minesLeft: -2 })

    expect(labels(wrapper)).toEqual(["Mines left: -2"])
  })
})
