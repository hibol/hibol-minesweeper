// Rendu du niveau carte (MapCanvas.vue), sans DOM : boîte englobante, couleur
// par case, image où un pixel = une case (ou un bloc de cases), pyramide de
// réductions.

// Indices de couleur, rangés par priorité croissante : fusionner un bloc de
// cases revient à garder le max. Les cases rares et les objectifs passent
// devant, le robot en marche en tête (c'est le repère à suivre).
export const MAP_COLOR = Object.freeze({
  EMPTY: 0,
  REVEALED: 1,
  FLAG: 2,
  TORNADO: 3,
  HEART: 4,
  MINE: 5,
  HIBOL: 6,
  CHEST: 7,
  ROBOT: 8,
})

// Variable CSS de chaque couleur : les mêmes aplats que la vue simplifiée
// (.simplified-* dans MineCell.vue), pour un passage sans saut à 10 px.
export const MAP_COLOR_VARS = Object.freeze({
  [MAP_COLOR.REVEALED]: "--color-map-revealed",
  [MAP_COLOR.FLAG]: "--color-map-flag",
  [MAP_COLOR.TORNADO]: "--color-tornado",
  [MAP_COLOR.HEART]: "--color-heart",
  [MAP_COLOR.MINE]: "--color-wrong",
  [MAP_COLOR.HIBOL]: "--color-chest-gold",
  [MAP_COLOR.CHEST]: "--color-chest-gold",
  [MAP_COLOR.ROBOT]: "--color-robot",
})

// Côté max de l'image de base : au-delà, chaque pixel regroupe 2 (puis 4…)
// cases pour borner la mémoire (4096² RGBA = 64 Mo).
export const MAP_BASE_MAX_SIZE = 4096

// Plancher de zoom maximal (px par case) en infini : le plancher adaptatif ne
// dépasse jamais cette valeur, même sur une partie toute neuve.
export const MAP_FLOOR_MAX = 4

// Mêmes conditions que les classes .simplified-* de MineCell : une case en
// pendingReveal reste cachée, un cœur pas encore vu (heartFogConfirmed) reste
// une case révélée ordinaire — sinon la carte trahirait sa position.
export function cellMapColor(cell) {
  if (cell.robotHere) {
    return MAP_COLOR.ROBOT
  }
  if (cell.revealed && !cell.pendingReveal) {
    if (cell.isChest) {
      return MAP_COLOR.CHEST
    }
    if (cell.isHibol) {
      return MAP_COLOR.HIBOL
    }
    if (cell.isMine) {
      return MAP_COLOR.MINE
    }
    if (cell.isHeart && cell.heartFogConfirmed) {
      return MAP_COLOR.HEART
    }
    if (cell.isTornado) {
      return MAP_COLOR.TORNADO
    }
    return MAP_COLOR.REVEALED
  }
  if (cell.flagged) {
    return MAP_COLOR.FLAG
  }
  return MAP_COLOR.EMPTY
}

// Inclut les cases en pendingReveal : la boîte ne doit pas grandir par
// à-coups pendant la marche d'un robot. null si rien n'a été touché.
export function touchedBounds(cells) {
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity

  for (const cell of cells.values()) {
    if (!cell.revealed && !cell.flagged) {
      continue
    }
    if (cell.x < minX) minX = cell.x
    if (cell.x > maxX) maxX = cell.x
    if (cell.y < minY) minY = cell.y
    if (cell.y > maxY) maxY = cell.y
  }

  return minX === Infinity ? null : { minX, minY, maxX, maxY }
}

// Couche = { x, y, width, height, cellsPerPixel, data } : (x, y) = case monde
// du coin haut-gauche, data = un indice MAP_COLOR par pixel.
export function buildBaseLayer(cells, bounds, maxSize = MAP_BASE_MAX_SIZE) {
  const spanX = bounds.maxX - bounds.minX + 1
  const spanY = bounds.maxY - bounds.minY + 1

  let cellsPerPixel = 1
  while (Math.ceil(Math.max(spanX, spanY) / cellsPerPixel) > maxSize) {
    cellsPerPixel *= 2
  }

  const width = Math.ceil(spanX / cellsPerPixel)
  const height = Math.ceil(spanY / cellsPerPixel)
  const data = new Uint8Array(width * height)

  for (const cell of cells.values()) {
    const color = cellMapColor(cell)
    if (color === MAP_COLOR.EMPTY) {
      continue
    }
    const dx = cell.x - bounds.minX
    const dy = cell.y - bounds.minY
    if (dx < 0 || dy < 0 || dx >= spanX || dy >= spanY) {
      continue
    }
    const i =
      Math.floor(dy / cellsPerPixel) * width + Math.floor(dx / cellsPerPixel)
    if (color > data[i]) {
      data[i] = color
    }
  }

  return { x: bounds.minX, y: bounds.minY, width, height, cellsPerPixel, data }
}

// Palier suivant : chaque pixel garde la couleur la plus prioritaire de son
// bloc 2×2. Ni moyenne ni échantillonnage, pour qu'un chemin d'une case de
// large survive à toutes les réductions.
export function downsampleLayer(layer) {
  const width = Math.ceil(layer.width / 2)
  const height = Math.ceil(layer.height / 2)
  const data = new Uint8Array(width * height)
  const src = layer.data

  for (let y = 0; y < layer.height; y++) {
    const srcRow = y * layer.width
    const dstRow = (y >> 1) * width
    for (let x = 0; x < layer.width; x++) {
      const v = src[srcRow + x]
      const i = dstRow + (x >> 1)
      if (v > data[i]) {
        data[i] = v
      }
    }
  }

  return {
    x: layer.x,
    y: layer.y,
    width,
    height,
    cellsPerPixel: layer.cellsPerPixel * 2,
    data,
  }
}

// Plus petit palier k (0 = base) où un pixel d'image couvre au moins un pixel
// physique : en dessous, drawImage sauterait des pixels, donc des chemins.
export function pyramidLevelFor(devicePxPerCell, baseCellsPerPixel = 1) {
  const pxPerImagePixel = devicePxPerCell * baseCellsPerPixel
  if (!(pxPerImagePixel > 0) || pxPerImagePixel >= 1) {
    return 0
  }
  // Epsilon : log2(1/0.25) doit donner 2 pile, pas 2.0000000001 → 3.
  return Math.ceil(Math.log2(1 / pxPerImagePixel) - 1e-9)
}

// Plancher de zoom (px par case) : min(MAP_FLOOR_MAX, taille qui fait tenir la
// zone touchée + une marge dans le viewport). Peut descendre bien sous 1 px.
export function adaptiveMinCellSize(
  bounds,
  viewWidth,
  viewHeight,
  { cap = MAP_FLOOR_MAX, marginRatio = 0.1, marginCells = 8 } = {},
) {
  if (!bounds || !(viewWidth > 0) || !(viewHeight > 0)) {
    return cap
  }
  const spanX = bounds.maxX - bounds.minX + 1
  const spanY = bounds.maxY - bounds.minY + 1
  const fitX = spanX * (1 + 2 * marginRatio) + 2 * marginCells
  const fitY = spanY * (1 + 2 * marginRatio) + 2 * marginCells
  return Math.min(cap, viewWidth / fitX, viewHeight / fitY)
}

// "#rgb", "#rrggbb" ou "#rrggbbaa" → [r, g, b, a] (les couleurs du thème sont
// en hex, cf. style.css). Noir opaque si illisible, plutôt qu'un trou.
export function parseHexColor(value) {
  const hex = String(value).trim().replace(/^#/, "")
  const full =
    hex.length === 3 || hex.length === 4
      ? [...hex].map((c) => c + c).join("")
      : hex
  if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(full)) {
    return [0, 0, 0, 255]
  }
  const n = (i) => parseInt(full.slice(i, i + 2), 16)
  return [n(0), n(2), n(4), full.length === 8 ? n(6) : 255]
}

// palette[indice MAP_COLOR] = [r, g, b, a] → pixels RGBA pour un ImageData.
// Les pixels EMPTY restent transparents (le fond du plateau passe dessous).
export function layerToRgba(layer, palette) {
  const out = new Uint8ClampedArray(layer.width * layer.height * 4)
  const { data } = layer
  for (let i = 0; i < data.length; i++) {
    const v = data[i]
    if (v === MAP_COLOR.EMPTY) {
      continue
    }
    const [r, g, b, a] = palette[v]
    const o = i * 4
    out[o] = r
    out[o + 1] = g
    out[o + 2] = b
    out[o + 3] = a
  }
  return out
}
