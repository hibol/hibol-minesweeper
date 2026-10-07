import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"

const read = (name) =>
  readFileSync(new URL(`./${name}`, import.meta.url), "utf8")
const footerCss = read("footer.css")
const stat = read("stat.css")
const positionStat = read("PositionStat.vue")

// jsdom n'a pas de mise en page : ces deux comportements, réglés à la main
// (5f41a36), ne sont gardés que par leur présence dans les feuilles.

describe("styles des pieds de page", () => {
  it("les stats se répartissent en lignes équilibrées (text-wrap: balance)", () => {
    const rule = footerCss.match(/\.stats-row\s*{[^}]*}/)?.[0]

    expect(rule).toContain("text-wrap: balance")
    expect(rule).toContain("letter-spacing: 1px")
  })

  it("les stats sont en inline-flex (condition du text-wrap: balance)", () => {
    expect(stat.match(/\.stat\s*{[^}]*}/)?.[0]).toContain(
      "display: inline-flex",
    )
  })

  it("la position garde une largeur fixe (pas d'oscillation de la ligne)", () => {
    const rule = positionStat.match(/\.stat-position\s*{[^}]*}/)?.[0]

    expect(rule).toContain("width: calc(16 * (1ch + 1px))")
    expect(rule).toContain("white-space: nowrap")
  })
})
