// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { ref, effectScope, nextTick } from "vue"
import { createGame, createInfiniteGame } from "../game/game"
import { usernamePrompted } from "../state/username"
import {
  usernameChoice,
  requireUsernameChoice,
  clearUsernameChoice,
} from "../state/usernameChoice"
import { retryOnlineQueues } from "../state/onlineQueues"
import { useUsernamePrompt } from "./useUsernamePrompt"

vi.mock("../state/onlineQueues", () => ({ retryOnlineQueues: vi.fn() }))

// Les parcours complets (dialogue à l'écran, saisie, pairage) sont dans
// App.online.integration.test.js. Ici : quand le dialogue s'ouvre ou non, et
// l'ordre des appels au démarrage.

let scope

function setup(game = createGame(10, 10, 20)) {
  const gameRef = ref(game)
  const maybeShowTapIntro = vi.fn()
  scope = effectScope()
  const api = scope.run(() => useUsernamePrompt(gameRef, { maybeShowTapIntro }))
  return { gameRef, maybeShowTapIntro, ...api }
}

// Partie avec de la progression réelle (cf. isMeaningfulRun).
function playedClassic(revealedCount = 5) {
  const game = createGame(10, 10, 20)
  game.revealedCount = revealedCount
  return game
}

beforeEach(() => {
  usernamePrompted.value = true
  retryOnlineQueues.mockClear()
})

afterEach(() => {
  scope?.stop()
  usernamePrompted.value = false
  clearUsernameChoice()
})

describe("useUsernamePrompt — démarrage", () => {
  it("1er lancement : ouvre le dialogue et retient le popup tap/long-press", () => {
    usernamePrompted.value = false
    const { showUsernameDialog, maybeShowTapIntro, promptAtBoot } = setup()

    promptAtBoot()

    expect(showUsernameDialog.value).toBe(true)
    expect(maybeShowTapIntro).not.toHaveBeenCalled()
  })

  it("pseudo déjà proposé : pas de dialogue, le popup tap/long-press passe", () => {
    const { showUsernameDialog, maybeShowTapIntro, promptAtBoot } = setup()

    promptAtBoot()

    expect(showUsernameDialog.value).toBe(false)
    expect(maybeShowTapIntro).toHaveBeenCalledOnce()
  })
})

describe("useUsernamePrompt — validation", () => {
  it("1er lancement : retient la proposition, ferme, laisse passer le popup tap et relance les files", () => {
    usernamePrompted.value = false
    const {
      showUsernameDialog,
      maybeShowTapIntro,
      promptAtBoot,
      onUsernameSubmit,
    } = setup()
    promptAtBoot()

    onUsernameSubmit()

    expect(usernamePrompted.value).toBe(true)
    expect(localStorage.getItem("hibol-minesweeper:username-prompted")).toBe(
      "true",
    )
    expect(showUsernameDialog.value).toBe(false)
    expect(maybeShowTapIntro).toHaveBeenCalledOnce()
    expect(retryOnlineQueues).toHaveBeenCalledOnce()
  })

  it("« nouveau pseudo » : ferme et relance les files, sans toucher au popup tap", async () => {
    const { usernameRetry, maybeShowTapIntro, onUsernameSubmit } = setup()
    requireUsernameChoice("taken", "test")
    await nextTick()
    expect(usernameRetry.value).not.toBeNull()

    onUsernameSubmit()

    expect(usernameRetry.value).toBeNull()
    expect(retryOnlineQueues).toHaveBeenCalledOnce()
    expect(maybeShowTapIntro).not.toHaveBeenCalled()
  })
})

describe("useUsernamePrompt — « nouveau pseudo » entre deux parties", () => {
  it("s'ouvre sur une copie figée de usernameChoice", async () => {
    const { usernameRetry } = setup()

    requireUsernameChoice("taken", "test")
    await nextTick()

    expect(usernameRetry.value).toEqual({
      reason: "taken",
      rejectedName: "test",
    })
    expect(usernameRetry.value).not.toBe(usernameChoice.value)

    clearUsernameChoice()
    await nextTick()
    expect(usernameRetry.value).not.toBeNull()
  })

  it("un nouveau refus pendant que le dialogue est ouvert ne le change pas sous les yeux du joueur", async () => {
    const { usernameRetry } = setup()
    requireUsernameChoice("taken", "test")
    await nextTick()
    const opened = usernameRetry.value

    requireUsernameChoice("account_gone", "autre")
    await nextTick()

    expect(usernameRetry.value).toBe(opened)
    expect(usernameRetry.value.reason).toBe("taken")
  })

  it("ne s'ouvre pas tant que le pseudo du 1er lancement n'a pas été proposé", async () => {
    usernamePrompted.value = false
    const { usernameRetry } = setup()

    requireUsernameChoice("taken", "test")
    await nextTick()

    expect(usernameRetry.value).toBeNull()
  })

  it("ne s'ouvre pas par-dessus le dialogue du 1er lancement", async () => {
    usernamePrompted.value = false
    const { usernameRetry, promptAtBoot } = setup()
    promptAtBoot()
    usernamePrompted.value = true // proposé entre-temps, dialogue encore ouvert

    requireUsernameChoice("taken", "test")
    await nextTick()

    expect(usernameRetry.value).toBeNull()
  })

  it("attend la fin d'une partie en cours, puis s'ouvre", async () => {
    const { gameRef, usernameRetry } = setup(playedClassic())
    // Partie jouée dans cette session (jamais reprise au démarrage).

    requireUsernameChoice("account_gone", "test")
    await nextTick()
    expect(usernameRetry.value).toBeNull()

    gameRef.value.status = "lost"
    await nextTick()
    expect(usernameRetry.value).not.toBeNull()
  })

  it("s'ouvre aussi quand une partie neuve remplace la partie en cours", async () => {
    const { gameRef, usernameRetry } = setup(playedClassic())
    requireUsernameChoice("taken", "test")
    await nextTick()

    gameRef.value = createGame(10, 10, 20)
    await nextTick()

    expect(usernameRetry.value).not.toBeNull()
  })

  it("Infini : l'ouverture automatique seule n'est pas une partie en cours", async () => {
    const game = createInfiniteGame(3)
    game.revealedCount = 1
    const { usernameRetry } = setup(game)

    requireUsernameChoice("taken", "test")
    await nextTick()

    expect(usernameRetry.value).not.toBeNull()
  })
})

describe("useUsernamePrompt — partie reprise au démarrage", () => {
  it("ne compte pas comme en cours tant qu'elle n'est pas rejouée", async () => {
    const { usernameRetry, promptAtBoot } = setup(playedClassic())
    promptAtBoot()

    requireUsernameChoice("taken", "test")
    await nextTick()

    expect(usernameRetry.value).not.toBeNull()
  })

  it("compte comme en cours dès qu'on y ouvre une case de plus", async () => {
    const { gameRef, usernameRetry, promptAtBoot } = setup(playedClassic())
    promptAtBoot()
    gameRef.value.revealedCount++

    requireUsernameChoice("taken", "test")
    await nextTick()

    expect(usernameRetry.value).toBeNull()
  })

  it("une autre partie de même progression n'est pas la reprise", async () => {
    const { gameRef, usernameRetry, promptAtBoot } = setup(playedClassic())
    promptAtBoot()
    gameRef.value = playedClassic() // même progression, autre objet

    requireUsernameChoice("taken", "test")
    await nextTick()

    expect(usernameRetry.value).toBeNull()
  })
})
