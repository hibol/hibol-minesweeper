import { describe, it, expect } from "vitest"
import { formatTreasureTime } from "./treasureTimeFormat"

describe("formatTreasureTime", () => {
  it("mm:ss, secondes tronquées, au-delà de 99 minutes sans plafond", () => {
    expect(formatTreasureTime(0)).toBe("00:00")
    expect(formatTreasureTime(59_999)).toBe("00:59")
    expect(formatTreasureTime(252_000)).toBe("04:12")
    expect(formatTreasureTime(6_000_000)).toBe("100:00")
  })
})
