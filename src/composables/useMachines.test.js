// @vitest-environment jsdom
// useMachines.js importe state/shop.js (lit l'inventaire depuis
// localStorage à l'import), donc jsdom comme shop.test.js.

import { describe, it, expect, beforeEach } from "vitest"
import { ref } from "vue"
import { useMachines } from "./useMachines.js"
import { createInfiniteGame } from "../game/game.js"
import { inventory } from "../state/shop.js"

function setupMachines(gameState) {
  const game = ref(gameState)
  const deps = {
    robotAnimationsActive: ref(0),
    originX: ref(0),
    originY: ref(0),
    viewportWidth: ref(0),
    viewportHeight: ref(0),
    animateOriginTo: () => {},
    cancelOriginTween: () => {},
    cancelPendingRobotReturn: () => {},
    drainRobotTrails: () => {},
    drainPendingHearts: () => {},
    persistActiveGame: () => {},
    travelTweenMs: 0,
    compassDotRadius: 0.4,
    confirmedHeartsCount: ref(0),
  }
  return { game, machines: useMachines(game, deps) }
}

beforeEach(() => {
  inventory.value = {}
})

describe("useMachines — game.usedMachines", () => {
  it("false à la création d'une partie infinie", () => {
    expect(createInfiniteGame(1).usedMachines).toBe(false)
  })

  it("Travel Machine réellement tirée (fireTravel) passe usedMachines à true", () => {
    inventory.value.travelMachine = 1
    const { game, machines } = setupMachines(createInfiniteGame(1))

    machines.useMachine("travelMachine") // arme la visée
    machines.travelAngle.value = 0 // direction +x
    machines.fireTravel()

    expect(game.value.usedMachines).toBe(true)
    expect(inventory.value.travelMachine).toBe(0)
  })

  it("visée Travel Machine annulée (cancelTravelAim) ne consomme rien, usedMachines reste false", () => {
    inventory.value.travelMachine = 1
    const { game, machines } = setupMachines(createInfiniteGame(1))

    machines.useMachine("travelMachine")
    machines.travelAngle.value = 0
    machines.cancelTravelAim()

    expect(game.value.usedMachines).toBe(false)
    expect(inventory.value.travelMachine).toBe(1)
  })

  it("Wind Machine réellement utilisée (voile présent) passe usedMachines à true", () => {
    inventory.value.windMachine = 1
    const { game, machines } = setupMachines(createInfiniteGame(1))
    game.value.minesTriggeredCount = 3 // > heartsCollectedCount ⇒ hasHaze

    machines.useMachine("windMachine")

    expect(game.value.usedMachines).toBe(true)
    expect(inventory.value.windMachine).toBe(0)
  })

  it("Wind Machine tapée sans voile à dissiper : no-op avant consume, usedMachines reste false", () => {
    inventory.value.windMachine = 1
    const { game, machines } = setupMachines(createInfiniteGame(1))
    // minesTriggeredCount === heartsCollectedCount (0 === 0) : pas de voile.

    machines.useMachine("windMachine")

    expect(game.value.usedMachines).toBe(false)
    expect(inventory.value.windMachine).toBe(1)
  })

  it("X-Ray réellement utilisé (tap grille pendant qu'il est armé) passe usedMachines à true", () => {
    inventory.value.xrayMachine = 1
    const { game, machines } = setupMachines(createInfiniteGame(1))

    machines.useMachine("xrayMachine") // arme le scan
    const used = machines.tryXrayTap({ x: 200, y: 0 })

    expect(used).toBe(true)
    expect(game.value.usedMachines).toBe(true)
    expect(inventory.value.xrayMachine).toBe(0)
  })

  it("tap grille alors que le X-Ray n'est pas armé : no-op avant consume, usedMachines reste false", () => {
    inventory.value.xrayMachine = 1
    const { game, machines } = setupMachines(createInfiniteGame(1))

    const used = machines.tryXrayTap({ x: 200, y: 0 })

    expect(used).toBe(false)
    expect(game.value.usedMachines).toBe(false)
    expect(inventory.value.xrayMachine).toBe(1)
  })
})
