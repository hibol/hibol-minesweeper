// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { mount } from "@vue/test-utils"
import DangerBar from "./DangerBar.vue"

describe("DangerBar", () => {
  it("remplit la barre à la proportion du niveau", () => {
    const wrapper = mount(DangerBar, { props: { level: 0.25 } })

    expect(wrapper.find(".danger-bar-fill").attributes("style")).toContain(
      "width: 25%",
    )
    expect(wrapper.text()).toBe("DANGER")
  })

  it("bat au-delà de 0.04 de proximité, pas en dessous", () => {
    const calm = mount(DangerBar, { props: { level: 0.5, hotspot: 0.04 } })
    const near = mount(DangerBar, { props: { level: 0.5, hotspot: 0.05 } })

    expect(calm.classes()).not.toContain("throbbing")
    expect(near.classes()).toContain("throbbing")
  })

  it("transmet l'amplitude au CSS en custom property", () => {
    const wrapper = mount(DangerBar, { props: { level: 0.5, hotspot: 0.5 } })

    expect(wrapper.attributes("style")).toContain("--pulse-strength: 0.5")
  })

  it("battement de 1.2 s en lisière de zone à 0.6 s au cœur", () => {
    const period = (hotspot) =>
      mount(DangerBar, { props: { level: 0.5, hotspot } })
        .attributes("style")
        .match(/--throb-period: ([^;]+)/)[1]

    expect(period(0)).toBe("1.200s")
    expect(period(0.5)).toBe("0.900s")
    expect(period(1)).toBe("0.600s")
  })
})
