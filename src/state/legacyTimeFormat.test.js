import { describe, it, expect } from "vitest"
import { formatLegacyTime } from "./legacyTimeFormat.js"

describe("formatLegacyTime", () => {
  it("mm:ss.cc sous la minute", () => {
    expect(formatLegacyTime(3500)).toBe("00:03.50")
  })

  it("mm:ss.cc au-delà de la minute (non plafonné)", () => {
    expect(formatLegacyTime(75432)).toBe("01:15.43")
  })

  it("temps très long (intermediate/expert), toujours pas de plafond", () => {
    expect(formatLegacyTime(725000)).toBe("12:05.00")
  })

  it("0ms", () => {
    expect(formatLegacyTime(0)).toBe("00:00.00")
  })
})
