// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { mount } from "@vue/test-utils"
import StatWithHelp from "./StatWithHelp.vue"
import { HEART_PIXELS } from "../../icons"

function mountStat(props) {
  return mount(StatWithHelp, {
    props: {
      pixels: HEART_PIXELS,
      label: "Hearts",
      value: 3,
      helpLabel: "What does a heart do?",
      ...props,
    },
  })
}

describe("StatWithHelp", () => {
  it("affiche la stat (libellé accessible et valeur) dans un .stat", () => {
    const wrapper = mountStat()

    expect(wrapper.classes()).toContain("stat")
    const stat = wrapper.find('[aria-label="Hearts: 3"]')
    expect(stat.exists()).toBe(true)
    expect(stat.text()).toBe("3")
  })

  it("pas de bouton « ? » sans showHelp", () => {
    expect(mountStat().find(".help-btn").exists()).toBe(false)
  })

  it("showHelp : un bouton nommé par helpLabel, qui émet help au clic", async () => {
    const wrapper = mountStat({ showHelp: true })

    const button = wrapper.find(".help-btn")
    expect(button.attributes("aria-label")).toBe("What does a heart do?")

    await button.trigger("click")
    expect(wrapper.emitted("help")).toHaveLength(1)
  })
})
