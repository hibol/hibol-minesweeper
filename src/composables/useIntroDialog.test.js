// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest"
import { useIntroDialog } from "./useIntroDialog"

const KEY = "hibol-minesweeper:seen-test-intro"

beforeEach(() => {
  localStorage.clear()
})

describe("useIntroDialog", () => {
  it("est fermé tant que maybeShow n'est pas appelé", () => {
    const { show } = useIntroDialog(KEY)

    expect(show.value).toBe(false)
  })

  it("s'ouvre si la clé n'est pas posée", () => {
    const { show, maybeShow } = useIntroDialog(KEY)

    maybeShow()

    expect(show.value).toBe(true)
  })

  it("se ferme sans poser la clé quand « ne plus afficher » n'est pas coché", () => {
    const { show, maybeShow, dismiss } = useIntroDialog(KEY)
    maybeShow()

    dismiss(false)

    expect(show.value).toBe(false)
    expect(localStorage.getItem(KEY)).toBeNull()
    maybeShow()
    expect(show.value).toBe(true)
  })

  it("pose la clé avec « ne plus afficher » et ne s'ouvre plus", () => {
    const first = useIntroDialog(KEY)
    first.maybeShow()
    first.dismiss(true)

    expect(localStorage.getItem(KEY)).toBe("true")

    // Même après un rechargement : une nouvelle instance relit le stockage.
    const second = useIntroDialog(KEY)
    second.maybeShow()
    expect(second.show.value).toBe(false)
  })

  it("ne s'ouvre jamais quand enabled est false", () => {
    const { show, maybeShow } = useIntroDialog(KEY, { enabled: false })

    maybeShow()

    expect(show.value).toBe(false)
  })

  it("une clé par dialogue : les introductions ne se masquent pas entre elles", () => {
    const a = useIntroDialog("a")
    const b = useIntroDialog("b")
    a.maybeShow()
    a.dismiss(true)

    b.maybeShow()

    expect(b.show.value).toBe(true)
  })
})
