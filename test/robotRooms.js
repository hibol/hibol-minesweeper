import { createInfiniteGame } from "../src/game/game.js"

// Pièces construites à la main pour les tests de robot (game.robot.test.js,
// useRobotAnimation.test.js) : rien n'est tiré au sort, le trajet est connu.

export function baseCell(x, y, props) {
  return {
    x,
    y,
    isMine: false,
    isHeart: false,
    isRobot: false,
    isTornado: false,
    revealed: false,
    flagged: false,
    wrong: false,
    neighborMines: 0,
    tiltDeg: 0,
    heartFogConfirmed: false,
    robotHere: false,
    ...props,
  }
}

export function emptyGame(seed) {
  const game = createInfiniteGame(seed)
  game.cells.clear()
  Object.assign(game, {
    revealedCount: 0,
    flaggedCount: 0,
    minesTriggeredCount: 0,
    heartsCollectedCount: 0,
    robotsTriggeredCount: 0,
    maxDistance: 0,
    robotWalks: [],
    robotClock: 0,
    pendingRobotTrails: [],
    pendingHeartReveals: [],
    robotWalkInProgress: false,
    openingInProgress: false,
  })
  return game
}

// Rectangle intérieur [x0..x1] x [y0..y1], ceinturé d'un anneau `revealed`
// (jamais candidat). `overrides` : { "x,y": props }. Ouverte sur l'extérieur :
// les voisins de l'anneau, absents de la Map, comptent comme cachés.
export function room(x0, y0, x1, y1, overrides = {}, seed = 1) {
  const game = emptyGame(seed)
  for (let y = y0 - 1; y <= y1 + 1; y++) {
    for (let x = x0 - 1; x <= x1 + 1; x++) {
      const border = x < x0 || x > x1 || y < y0 || y > y1
      game.cells.set(
        `${x},${y}`,
        baseCell(x, y, border ? { revealed: true } : {}),
      )
    }
  }
  for (const [key, props] of Object.entries(overrides)) {
    Object.assign(game.cells.get(key), props)
  }
  return game
}

// room() vraiment fermée : un anneau de drapeaux autour de la bordure. Sans
// lui, la bordure est un bord de poche, et un robot qui la rejoint découvre
// des cases générées par le hash, hors de la pièce.
export function closedRoom(x0, y0, x1, y1, overrides = {}, seed = 1) {
  const game = room(x0, y0, x1, y1, overrides, seed)
  for (let y = y0 - 2; y <= y1 + 2; y++) {
    for (let x = x0 - 2; x <= x1 + 2; x++) {
      if (x === x0 - 2 || x === x1 + 2 || y === y0 - 2 || y === y1 + 2) {
        game.cells.set(`${x},${y}`, baseCell(x, y, { flagged: true }))
      }
    }
  }
  return game
}
