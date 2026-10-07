// Rendu du niveau carte (MapCanvas.vue), sans DOM : boîte englobante, couleur
// par case, image où un pixel = une case (ou un bloc de cases), pyramide de
// réductions. Le canvas de l'export PNG est passé par l'appelant.

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

// Marge (en cases) autour de la zone touchée quand on construit l'image : la
// zone peut grandir de quelques pas de robot sans reconstruction complète.
export const MAP_BUILD_MARGIN = 32

// Mêmes conditions que les classes .simplified-* de MineCell : un cœur pas
// encore vu (heartFogConfirmed) reste une case révélée ordinaire — sinon la
// carte trahirait sa position.
export function cellMapColor(cell) {
  if (cell.robotHere) {
    return MAP_COLOR.ROBOT
  }
  if (cell.revealed) {
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

// Boîte des cases révélées ou flaguées. null si rien n'a été touché.
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

// Agrandit `bounds` (ou null) pour couvrir les cases touchées de `cells` (un
// tableau). Renvoie le même objet s'il ne grandit pas.
export function extendBounds(bounds, cells) {
  let next = bounds
  for (const cell of cells) {
    if (!cell.revealed && !cell.flagged) {
      continue
    }
    if (
      next &&
      cell.x >= next.minX &&
      cell.x <= next.maxX &&
      cell.y >= next.minY &&
      cell.y <= next.maxY
    ) {
      continue
    }
    next = next
      ? {
          minX: Math.min(next.minX, cell.x),
          minY: Math.min(next.minY, cell.y),
          maxX: Math.max(next.maxX, cell.x),
          maxY: Math.max(next.maxY, cell.y),
        }
      : { minX: cell.x, minY: cell.y, maxX: cell.x, maxY: cell.y }
  }
  return next
}

export function boundsContain(outer, inner) {
  return (
    !inner ||
    (!!outer &&
      inner.minX >= outer.minX &&
      inner.maxX <= outer.maxX &&
      inner.minY >= outer.minY &&
      inner.maxY <= outer.maxY)
  )
}

// Union de deux boîtes (null = vide). Renvoie `a` tel quel s'il contient `b`.
export function unionBounds(a, b) {
  if (boundsContain(a, b)) {
    return a
  }
  if (!a) {
    return b
  }
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  }
}

export function paddedBounds(bounds, margin = MAP_BUILD_MARGIN) {
  return {
    minX: bounds.minX - margin,
    minY: bounds.minY - margin,
    maxX: bounds.maxX + margin,
    maxY: bounds.maxY + margin,
  }
}

// Cases monde couvertes par une couche (bord droit/bas exclusif arrondi au
// bloc), sous forme de boîte inclusive.
export function layerBounds(layer) {
  return {
    minX: layer.x,
    minY: layer.y,
    maxX: layer.x + layer.width * layer.cellsPerPixel - 1,
    maxY: layer.y + layer.height * layer.cellsPerPixel - 1,
  }
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
    // Toute la grille de pixels, bloc du bord compris (cf. layerBounds).
    const px = Math.floor(dx / cellsPerPixel)
    const py = Math.floor(dy / cellsPerPixel)
    if (dx < 0 || dy < 0 || px >= width || py >= height) {
      continue
    }
    const i = py * width + px
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
// `rect` (pixels de couche, bords inclus) : seulement ce rectangle, pour
// repeindre une zone après une mise à jour incrémentale.
export function layerToRgba(
  layer,
  palette,
  rect = { x0: 0, y0: 0, x1: layer.width - 1, y1: layer.height - 1 },
) {
  const width = rect.x1 - rect.x0 + 1
  const height = rect.y1 - rect.y0 + 1
  const out = new Uint8ClampedArray(width * height * 4)
  const { data } = layer
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = data[(rect.y0 + y) * layer.width + rect.x0 + x]
      if (v === MAP_COLOR.EMPTY) {
        continue
      }
      const [r, g, b, a] = palette[v]
      const o = (y * width + x) * 4
      out[o] = r
      out[o + 1] = g
      out[o + 2] = b
      out[o + 3] = a
    }
  }
  return out
}

// --- Export PNG ---------------------------------------------------------

// px par case de l'export, réduit pour qu'une très longue run reste sous
// MAP_EXPORT_MAX_DIMENSION de côté.
export const MAP_EXPORT_PX_PER_CELL = 6
export const MAP_EXPORT_MAX_DIMENSION = 4000

function exportCellColor(cell, colors) {
  if (cell.flagged) {
    return colors.flag
  }
  if (cell.isMine) {
    return colors.mine
  }
  if (cell.isHeart) {
    return colors.heart
  }
  return colors.revealed
}

// Dessine toute la zone explorée sur `canvas`, au rendu "simplifié" (aplats,
// cf. .simplified-* dans MineCell.vue). `colors` = { board, revealed, flag,
// mine, heart } en couleurs CSS déjà résolues (un canvas ne comprend pas
// var()). Renvoie false, canvas intact, si aucune case n'est touchée.
export function drawMapExport(canvas, cells, colors) {
  const touched = [...cells.values()].filter(
    (cell) => cell.revealed || cell.flagged,
  )
  const bounds = extendBounds(null, touched)
  if (!bounds) {
    return false
  }

  const widthCells = bounds.maxX - bounds.minX + 1
  const heightCells = bounds.maxY - bounds.minY + 1
  const scale = Math.max(
    1,
    Math.min(
      MAP_EXPORT_PX_PER_CELL,
      Math.floor(MAP_EXPORT_MAX_DIMENSION / Math.max(widthCells, heightCells)),
    ),
  )

  canvas.width = widthCells * scale
  canvas.height = heightCells * scale

  const ctx = canvas.getContext("2d")
  ctx.fillStyle = colors.board
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  for (const cell of touched) {
    ctx.fillStyle = exportCellColor(cell, colors)
    ctx.fillRect(
      (cell.x - bounds.minX) * scale,
      (cell.y - bounds.minY) * scale,
      scale,
      scale,
    )
  }

  return true
}

// --- Mise à jour incrémentale (pas de robot) ----------------------------

// Recalcule le pixel (px, py) de la couche de base à partir de toutes les
// cases de son bloc, pas seulement de la case changée : une case peut baisser
// de priorité (le robot la quitte). Renvoie true si le pixel a changé.
function refreshBasePixel(base, cells, px, py) {
  const cpp = base.cellsPerPixel
  let color = MAP_COLOR.EMPTY
  for (let dy = 0; dy < cpp; dy++) {
    for (let dx = 0; dx < cpp; dx++) {
      const x = base.x + px * cpp + dx
      const y = base.y + py * cpp + dy
      const cell = cells.get(`${x},${y}`)
      if (cell) {
        color = Math.max(color, cellMapColor(cell))
      }
    }
  }
  const i = py * base.width + px
  if (base.data[i] === color) {
    return false
  }
  base.data[i] = color
  return true
}

// Pixel parent (px, py) recalculé à partir de ses (jusqu'à) 4 enfants.
function refreshParentPixel(parent, child, px, py) {
  let color = MAP_COLOR.EMPTY
  for (let dy = 0; dy < 2; dy++) {
    for (let dx = 0; dx < 2; dx++) {
      const cx = px * 2 + dx
      const cy = py * 2 + dy
      if (cx < child.width && cy < child.height) {
        color = Math.max(color, child.data[cy * child.width + cx])
      }
    }
  }
  const i = py * parent.width + px
  if (parent.data[i] === color) {
    return false
  }
  parent.data[i] = color
  return true
}

function growRect(rect, x, y) {
  if (!rect) {
    return { x0: x, y0: y, x1: x, y1: y }
  }
  rect.x0 = Math.min(rect.x0, x)
  rect.y0 = Math.min(rect.y0, y)
  rect.x1 = Math.max(rect.x1, x)
  rect.y1 = Math.max(rect.y1, y)
  return rect
}

// Applique des cases changées à une pyramide déjà construite (layers[0] =
// base, puis paliers 2×2 successifs), en place. Renvoie { outside, rects } :
// outside = une case tombe hors de l'image (il faut tout reconstruire),
// rects[k] = rectangle de pixels modifiés du palier k (null si aucun).
export function applyCellChanges(layers, cells, changedCells) {
  const base = layers[0]
  const rects = layers.map(() => null)
  const extent = layerBounds(base)
  let pixels = []

  for (const cell of changedCells) {
    if (
      cell.x < extent.minX ||
      cell.x > extent.maxX ||
      cell.y < extent.minY ||
      cell.y > extent.maxY
    ) {
      return { outside: true, rects }
    }
    const px = Math.floor((cell.x - base.x) / base.cellsPerPixel)
    const py = Math.floor((cell.y - base.y) / base.cellsPerPixel)
    if (refreshBasePixel(base, cells, px, py)) {
      rects[0] = growRect(rects[0], px, py)
      pixels.push([px, py])
    }
  }

  // Remonte palier par palier, seulement là où un enfant a changé.
  for (let k = 1; k < layers.length && pixels.length > 0; k++) {
    const seen = new Set()
    const next = []
    for (const [cx, cy] of pixels) {
      const px = cx >> 1
      const py = cy >> 1
      const key = py * layers[k].width + px
      if (seen.has(key)) {
        continue
      }
      seen.add(key)
      if (refreshParentPixel(layers[k], layers[k - 1], px, py)) {
        rects[k] = growRect(rects[k], px, py)
        next.push([px, py])
      }
    }
    pixels = next
  }

  return { outside: false, rects }
}
