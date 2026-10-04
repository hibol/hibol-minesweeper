import { describe, it, expect } from "vitest"
import { formatPosition } from "./formatPosition"

describe("formatPosition", () => {
  it("valeurs positives et négatives", () => {
    expect(formatPosition(12, -10)).toBe("x,y(12;-10)")
    expect(formatPosition(-3, 7)).toBe("x,y(-3;7)")
  })

  it("zéro, y compris le -0 produit par la négation de centerCellY", () => {
    expect(formatPosition(0, 0)).toBe("x,y(0;0)")
    expect(formatPosition(-0, -0)).toBe("x,y(0;0)")
  })

  it("grands nombres : la forme la plus longue prévue fait 16 caractères", () => {
    expect(formatPosition(-9999, -9999)).toBe("x,y(-9999;-9999)")
    expect(formatPosition(-9999, -9999)).toHaveLength(16)
    expect(formatPosition(123456, -78)).toBe("x,y(123456;-78)")
  })
})
