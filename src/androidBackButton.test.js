// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest"
import { handleBackButton } from "./androidBackButton"

describe("handleBackButton", () => {
  const listeners = []
  function onDocumentKeydown(fn) {
    document.addEventListener("keydown", fn)
    listeners.push(fn)
  }
  afterEach(() => {
    listeners.forEach((fn) => document.removeEventListener("keydown", fn))
    listeners.length = 0
  })

  it("rien d'ouvert : personne ne consomme l'Échap, l'app passe en arrière-plan", () => {
    const minimize = vi.fn()
    handleBackButton(minimize)
    expect(minimize).toHaveBeenCalledOnce()
  })

  it("un overlay consomme l'Échap : il se ferme, l'app reste au premier plan", () => {
    const close = vi.fn()
    onDocumentKeydown((e) => {
      if (e.key === "Escape") {
        e.preventDefault()
        close()
      }
    })
    const minimize = vi.fn()
    handleBackButton(minimize)
    expect(close).toHaveBeenCalledOnce()
    expect(minimize).not.toHaveBeenCalled()
  })

  it("l'Échap simulé remonte jusqu'à window (là où écoute le menu burger)", () => {
    const onWindow = vi.fn()
    window.addEventListener("keydown", onWindow)
    handleBackButton(() => {})
    window.removeEventListener("keydown", onWindow)
    expect(onWindow).toHaveBeenCalledOnce()
  })
})
