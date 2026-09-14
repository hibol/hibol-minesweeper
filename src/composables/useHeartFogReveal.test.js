import { describe, it, expect } from "vitest"
import { ref, nextTick } from "vue"
import { useFogOfWar } from "./useFogOfWar.js"
import { useHeartFogReveal } from "./useHeartFogReveal.js"
import { useWindMachine } from "../game/game.js"

// Cellules/`game` construits à la main (comme useCompass.test.js), pas via
// createInfiniteGame : ce qui est testé ici (pending/confirmed, timing du
// watcher de reprise, interaction avec la Wind Machine) ne dépend d'aucune
// génération procédurale — seulement des champs lus par useFogOfWar /
// useHeartFogReveal (mode/status/compteurs/cells/pendingHeartReveals).

function makeGame(overrides = {}) {
  return {
    mode: "infinite",
    status: "playing",
    minesTriggeredCount: 0,
    heartsCollectedCount: 0,
    heartFogWindCredit: 0,
    darknessMineThreshold: 8,
    cells: new Map(),
    pendingHeartReveals: [],
    ...overrides,
  }
}

function heartCell(x, y, { heartFogConfirmed = false, revealed = true } = {}) {
  return { x, y, isHeart: true, revealed, heartFogConfirmed }
}

// Câblage identique à App.vue : useFogOfWar produit clearRadiusX/Y à partir
// de confirmedHeartsCount, useHeartFogReveal les consomme et mute ce même
// ref. containerWidth/Height (px) = viewportWidth/Height (cases) * cellSize,
// comme cellsAcross/cellsDown dans App.vue.
function setupFog({
  game: gameState,
  originX = 0,
  originY = 0,
  cellSize = 10,
  viewportWidthCells = 10,
  viewportHeightCells = 10,
  haloPositions = [],
  haloRadius = 0,
}) {
  const game = ref(gameState)
  const originXRef = ref(originX)
  const originYRef = ref(originY)
  const cellSizeRef = ref(cellSize)
  const viewportWidth = ref(viewportWidthCells)
  const viewportHeight = ref(viewportHeightCells)
  const containerWidth = ref(viewportWidthCells * cellSize)
  const containerHeight = ref(viewportHeightCells * cellSize)
  const haloPositionsRef = ref(haloPositions)
  const haloRadiusRef = ref(haloRadius)
  const confirmedHeartsCount = ref(0)

  const { darkness, clearRadiusX, clearRadiusY } = useFogOfWar(
    game,
    viewportWidth,
    viewportHeight,
    cellSizeRef,
    cellSize,
    confirmedHeartsCount,
  )

  const { drainPendingHearts } = useHeartFogReveal(game, {
    originX: originXRef,
    originY: originYRef,
    cellSize: cellSizeRef,
    containerWidth,
    containerHeight,
    clearRadiusX,
    clearRadiusY,
    haloPositions: haloPositionsRef,
    haloRadius: haloRadiusRef,
    confirmedHeartsCount,
  })

  return {
    game,
    confirmedHeartsCount,
    darkness,
    drainPendingHearts,
    originX: originXRef,
    originY: originYRef,
  }
}

describe("useHeartFogReveal — pending vs confirmé", () => {
  // Le cœur est poussé dans pendingHeartReveals APRÈS le montage du composable
  // (setupFog), jamais dans le fixture initial : le watcher immediate de
  // resetFromGame (roule dès le montage, cf. describe suivant) vide cette
  // file comme s'il s'agissait d'un vieux reveal déjà comptabilisé — l'y
  // mettre avant reviendrait à tester un scénario qui ne peut pas arriver en
  // vrai (openCell ne pousse que pendant la partie, jamais avant montage).

  it("un cœur révélé qui tombe dans la zone claire est confirmé tout de suite", () => {
    const { game, confirmedHeartsCount, drainPendingHearts } = setupFog({
      game: makeGame(),
    })

    const heart = heartCell(5, 5)
    game.value.pendingHeartReveals.push(heart)
    drainPendingHearts()

    expect(heart.heartFogConfirmed).toBe(true)
    expect(confirmedHeartsCount.value).toBe(1)
  })

  it("un cœur révélé hors champ (grosse cascade) reste en attente, non confirmé", () => {
    const { game, confirmedHeartsCount, drainPendingHearts } = setupFog({
      game: makeGame(),
    })

    const heart = heartCell(1000, 1000)
    game.value.pendingHeartReveals.push(heart)
    drainPendingHearts()

    expect(heart.heartFogConfirmed).toBe(false)
    expect(confirmedHeartsCount.value).toBe(0)
  })

  it("un déplacement de caméra qui ramène un cœur en attente dans le champ le confirme automatiquement", async () => {
    const { game, confirmedHeartsCount, drainPendingHearts, originX, originY } =
      setupFog({ game: makeGame() })

    const heart = heartCell(1000, 1000)
    game.value.pendingHeartReveals.push(heart)
    drainPendingHearts()
    expect(confirmedHeartsCount.value).toBe(0)

    originX.value = 995
    originY.value = 995
    await nextTick()

    expect(heart.heartFogConfirmed).toBe(true)
    expect(confirmedHeartsCount.value).toBe(1)
  })

  it("le halo d'un robot en marche confirme un cœur pourtant hors de l'ellipse principale", () => {
    // Écran du cœur avec origin (0,0) / cellSize 10 : (1000*10+5, 1000*10+5).
    const { game, confirmedHeartsCount, drainPendingHearts } = setupFog({
      game: makeGame(),
      haloPositions: [{ x: 10005, y: 10005 }],
      haloRadius: 20,
    })

    const heart = heartCell(1000, 1000)
    game.value.pendingHeartReveals.push(heart)
    drainPendingHearts()

    expect(heart.heartFogConfirmed).toBe(true)
    expect(confirmedHeartsCount.value).toBe(1)
  })
})

describe("useHeartFogReveal — reprise (game.value remplacé)", () => {
  it("resetFromGame recompte confirmedHeartsCount depuis les cellules ET le crédit vent persisté", () => {
    const game = makeGame({
      cells: new Map([["a", heartCell(0, 0, { heartFogConfirmed: true })]]),
    })
    const { confirmedHeartsCount } = setupFog({ game })

    expect(confirmedHeartsCount.value).toBe(1)
  })

  it("BUG resumeGame/redrawFog : le recalcul doit être SYNCHRONE — un remplacement de game.value doit se refléter immédiatement, sans attendre un tick", () => {
    const before = makeGame({
      cells: new Map([["a", heartCell(0, 0, { heartFogConfirmed: true })]]),
    })
    const { game, confirmedHeartsCount } = setupFog({ game: before })
    expect(confirmedHeartsCount.value).toBe(1)

    // Simule "ferme l'app, rouvre-la" : game.value entièrement remplacé par
    // un état restauré, avec un tout autre historique (2 cœurs vus, un crédit
    // vent persisté par une Wind Machine utilisée avant la fermeture).
    game.value = makeGame({
      heartFogWindCredit: 3,
      cells: new Map([
        ["b", heartCell(5, 5, { heartFogConfirmed: true })],
        ["c", heartCell(6, 6, { heartFogConfirmed: true })],
        ["d", heartCell(1000, 1000, { heartFogConfirmed: false })], // pas encore vu
      ]),
    })

    // AUCUN await ici — exactement la séquence de resumeGame() dans App.vue
    // (game.value = ... puis redrawFog() sur la ligne suivante). Avant le
    // fix (flush par défaut "pre"), confirmedHeartsCount valait encore 1 ici
    // (l'ancienne partie) : le voile redessiné à cet instant était donc
    // périmé, corrigé seulement au prochain changement réel.
    expect(confirmedHeartsCount.value).toBe(2 + 3)
  })
})

describe("cohérence exhaustive — mines / cœurs vus / Wind Machine / fermeture-réouverture", () => {
  it("mines exploded ↑ voile, cœur vu ↓ voile, Wind Machine → 0, resume → toujours 0 sans await, mine suivante ↑, cœur suivant ↓ tout de suite (pas de zone morte)", () => {
    const initialHeart = heartCell(5, 5, { heartFogConfirmed: true })
    const game = makeGame({
      minesTriggeredCount: 8,
      heartsCollectedCount: 8,
      darknessMineThreshold: 8,
      cells: new Map([["a", initialHeart]]),
    })
    const { game: gameRef, confirmedHeartsCount, darkness, drainPendingHearts } =
      setupFog({ game })

    // 8 mines, 1 seul cœur réellement VU → voile encore épais.
    expect(confirmedHeartsCount.value).toBe(1)
    expect(darkness.value).toBeGreaterThan(0)

    // Wind Machine, exactement comme useMachines.js : delta moteur reporté
    // tout de suite sur le ref Vue.
    const delta = useWindMachine(gameRef.value, confirmedHeartsCount.value)
    confirmedHeartsCount.value += delta
    expect(darkness.value).toBe(0)

    // Fermeture + réouverture : game.value remplacé par un état restauré
    // avec le même unique cœur vu et le crédit vent persistés (gameStorage.js).
    gameRef.value = makeGame({
      minesTriggeredCount: gameRef.value.minesTriggeredCount,
      heartsCollectedCount: gameRef.value.heartsCollectedCount,
      heartFogWindCredit: gameRef.value.heartFogWindCredit,
      darknessMineThreshold: 8,
      cells: new Map([["a", heartCell(5, 5, { heartFogConfirmed: true })]]),
    })

    // Sans await : le voile doit rester dissipé tout de suite après la
    // réouverture (le bug rapporté : "le brouillard n'est pas redessiné à
    // l'ouverture, et apparaît seulement à la mine explosée suivante").
    expect(darkness.value).toBe(0)

    // Nouvelle mine après réouverture : le voile doit remonter tout de suite.
    gameRef.value.minesTriggeredCount += 1
    expect(darkness.value).toBeGreaterThan(0)
    const darknessAfterMine = darkness.value

    // Nouveau cœur trouvé ET vu tout de suite après : doit alléger le voile
    // sans attendre — aucune zone morte même après un resume (c'était le bug
    // de la 1re version du fix Wind Machine : un plancher relu à chaque
    // calcul au lieu d'un delta additif appliqué une fois).
    const newHeart = heartCell(6, 6)
    gameRef.value.pendingHeartReveals.push(newHeart)
    drainPendingHearts()

    expect(newHeart.heartFogConfirmed).toBe(true)
    expect(darkness.value).toBeLessThan(darknessAfterMine)
  })
})
