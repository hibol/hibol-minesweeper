import { describe, it, expect } from "vitest"
import { useSpecialCellHelp } from "./useSpecialCellHelp"

describe("useSpecialCellHelp", () => {
  it("fermée au départ, sans contenu", () => {
    const help = useSpecialCellHelp()

    expect(help.show.value).toBe(false)
    expect(help.content.value).toEqual({})
  })

  it.each([
    ["heart", "HEART"],
    ["robot", "ROBOT"],
    ["tornado", "TORNADO"],
    ["hibol", "HIBOL"],
  ])("open(%s) affiche l'explication de la case", (kind, name) => {
    const help = useSpecialCellHelp()

    help.open(kind)

    expect(help.show.value).toBe(true)
    expect(help.content.value.name).toBe(name)
    expect(help.content.value.pixels).toBeTruthy()
    expect(help.content.value.description).toBeTruthy()
  })

  it("une seule case à la fois : open remplace, close vide", () => {
    const help = useSpecialCellHelp()

    help.open("heart")
    help.open("robot")
    expect(help.content.value.name).toBe("ROBOT")

    help.close()
    expect(help.show.value).toBe(false)
    expect(help.content.value).toEqual({})
  })
})
