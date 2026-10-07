// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { mount } from "@vue/test-utils"
import FooterStat from "./FooterStat.vue"
import { FOOTER_ICON_SIZE } from "./footer.js"
import { FLAG_PIXELS } from "../../icons"

describe("FooterStat", () => {
  const wrapper = mount(FooterStat, {
    props: { pixels: FLAG_PIXELS, label: "Flags", value: "3/20" },
  })

  it("est une stat accessible posée comme .stat, sans élément en plus", () => {
    expect(wrapper.element.tagName).toBe("SPAN")
    expect(wrapper.classes()).toEqual(
      expect.arrayContaining(["pixel-stat", "stat"]),
    )
    expect(wrapper.attributes("aria-label")).toBe("Flags: 3/20")
    expect(wrapper.text()).toBe("3/20")
  })

  it("dessine son sprite à la taille des footers", () => {
    expect(FOOTER_ICON_SIZE).toBe(20)
    expect(wrapper.find("svg").attributes("style")).toContain(
      `width: ${FOOTER_ICON_SIZE}px`,
    )
  })
})
