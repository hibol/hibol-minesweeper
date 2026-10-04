import { describe, it, expect } from "vitest"
import {
  formatDateTime,
  formatDate,
  formatClockTime,
  formatDayKey,
} from "./dateFormat"

// Le format exact dépend de la locale de la machine : on vérifie la forme,
// pas une chaîne figée.
const TIMESTAMP = new Date(2026, 9, 4, 14, 5).getTime()

describe("dateFormat", () => {
  it("formatDayKey : AAAAMMJJ -> AAAA-MM-JJ", () => {
    expect(formatDayKey("20261004")).toBe("2026-10-04")
  })

  it("formatDate : date seule, vide si absente", () => {
    expect(formatDate(TIMESTAMP)).toBe(new Date(TIMESTAMP).toLocaleDateString())
    expect(formatDate(null)).toBe("")
    expect(formatDate(undefined)).toBe("")
  })

  it("formatDate accepte aussi une date ISO (classements serveur)", () => {
    expect(formatDate("2026-01-02T00:00:00Z")).toContain("2026")
  })

  it("formatClockTime : heure et minutes, vide si absente", () => {
    expect(formatClockTime(TIMESTAMP)).toMatch(/14|2/)
    expect(formatClockTime(TIMESTAMP)).toContain("05")
    expect(formatClockTime("")).toBe("")
  })

  it("formatDateTime : la date puis l'heure", () => {
    expect(formatDateTime(TIMESTAMP)).toBe(
      `${formatDate(TIMESTAMP)} ${formatClockTime(TIMESTAMP)}`,
    )
  })
})
