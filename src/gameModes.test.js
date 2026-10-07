import { describe, it, expect } from "vitest"
import {
  MODES,
  isMeaningfulProgress,
  isMeaningfulRun,
  chooseBootMode,
  fallbackBootMode,
} from "./gameModes"
import { MAX_OPENING_REVEAL } from "./game/game"

describe("isMeaningfulProgress", () => {
  it.each(["classic", "legacy", "treasure"])(
    "%s : dès une case révélée",
    (mode) => {
      expect(isMeaningfulProgress(mode, "playing", 0)).toBe(false)
      expect(isMeaningfulProgress(mode, "playing", 1)).toBe(true)
    },
  )

  it("infini : l'ouverture de départ ne compte pas", () => {
    expect(isMeaningfulProgress("infinite", "playing", 1)).toBe(false)
    expect(
      isMeaningfulProgress("infinite", "playing", MAX_OPENING_REVEAL),
    ).toBe(false)
    expect(
      isMeaningfulProgress("infinite", "playing", MAX_OPENING_REVEAL + 1),
    ).toBe(true)
  })

  it.each(["won", "lost"])("jamais une partie terminée (%s)", (status) => {
    expect(isMeaningfulProgress("classic", status, 50)).toBe(false)
    expect(isMeaningfulProgress("infinite", status, 500)).toBe(false)
  })

  it("isMeaningfulRun lit mode, statut et cases de la partie", () => {
    expect(
      isMeaningfulRun({ mode: "classic", status: "playing", revealedCount: 3 }),
    ).toBe(true)
    expect(
      isMeaningfulRun({ mode: "classic", status: "lost", revealedCount: 3 }),
    ).toBe(false)
  })
})

describe("MODES", () => {
  it("liste les quatre modes qui ont un slot", () => {
    expect(MODES).toEqual(["classic", "infinite", "treasure", "legacy"])
  })
})

describe("chooseBootMode", () => {
  // [dernier mode, infini débloqué, Legacy acheté, mode d'ouverture]
  it.each([
    // Jamais joué : classic, ou Legacy s'il remplace le classic.
    [null, false, false, "classic"],
    [null, true, false, "classic"],
    [null, false, true, "legacy"],
    [null, true, true, "legacy"],
    // Classic.
    ["classic", false, false, "classic"],
    ["classic", true, false, "classic"],
    ["classic", false, true, "legacy"],
    ["classic", true, true, "legacy"],
    // Infini et trésor partagent le verrou ; verrouillés, le classic de repli
    // est lui-même remplacé par Legacy s'il est acheté.
    ["infinite", false, false, "classic"],
    ["infinite", true, false, "infinite"],
    ["infinite", false, true, "legacy"],
    ["infinite", true, true, "infinite"],
    ["treasure", false, false, "classic"],
    ["treasure", true, false, "treasure"],
    ["treasure", false, true, "legacy"],
    ["treasure", true, true, "treasure"],
    // Legacy pas acheté : retour au classic.
    ["legacy", false, false, "classic"],
    ["legacy", true, false, "classic"],
    ["legacy", false, true, "legacy"],
    ["legacy", true, true, "legacy"],
  ])(
    "dernier mode %s, infini débloqué %s, Legacy acheté %s → %s",
    (lastMode, infiniteUnlocked, legacyUnlocked, expected) => {
      expect(
        chooseBootMode({ lastMode, infiniteUnlocked, legacyUnlocked }),
      ).toBe(expected)
    },
  )
})

describe("fallbackBootMode", () => {
  it("Legacy s'il est acheté, sinon classic", () => {
    expect(fallbackBootMode(true)).toBe("legacy")
    expect(fallbackBootMode(false)).toBe("classic")
  })
})
