import { describe, it, expect } from "vitest"
import {
  MAP_COLOR,
  MAP_COLOR_VARS,
  MAP_FLOOR_MAX,
  adaptiveMinCellSize,
  buildBaseLayer,
  cellMapColor,
  downsampleLayer,
  layerToRgba,
  parseHexColor,
  pyramidLevelFor,
  touchedBounds,
} from "./mapRender"

function cell(x, y, props = {}) {
  return {
    x,
    y,
    revealed: false,
    flagged: false,
    isMine: false,
    isHeart: false,
    pendingReveal: false,
    heartFogConfirmed: false,
    ...props,
  }
}

function cellMap(cells) {
  return new Map(cells.map((c) => [`${c.x},${c.y}`, c]))
}

describe("cellMapColor", () => {
  const revealed = (props) => cell(0, 0, { revealed: true, ...props })

  it("reprend les aplats de la vue simplifiée pour une case révélée", () => {
    expect(cellMapColor(revealed({ isMine: true }))).toBe(MAP_COLOR.MINE)
    expect(cellMapColor(revealed({ isChest: true }))).toBe(MAP_COLOR.CHEST)
    expect(cellMapColor(revealed({ isHibol: true }))).toBe(MAP_COLOR.HIBOL)
    expect(cellMapColor(revealed({ isTornado: true }))).toBe(MAP_COLOR.TORNADO)
    expect(cellMapColor(revealed())).toBe(MAP_COLOR.REVEALED)
  })

  it("donne drapeau pour une case flaguée, rien pour une case non touchée", () => {
    expect(cellMapColor(cell(0, 0, { flagged: true }))).toBe(MAP_COLOR.FLAG)
    expect(cellMapColor(cell(0, 0))).toBe(MAP_COLOR.EMPTY)
  })

  it("montre le robot en marche, même sur une case pas encore démasquée", () => {
    expect(cellMapColor(revealed({ robotHere: true }))).toBe(MAP_COLOR.ROBOT)
    expect(cellMapColor(cell(0, 0, { robotHere: true }))).toBe(MAP_COLOR.ROBOT)
  })

  it("range les indices par priorité, robot en tête, mine > cœur > drapeau > révélée", () => {
    const order = [
      MAP_COLOR.EMPTY,
      MAP_COLOR.REVEALED,
      MAP_COLOR.FLAG,
      MAP_COLOR.TORNADO,
      MAP_COLOR.HEART,
      MAP_COLOR.MINE,
      MAP_COLOR.HIBOL,
      MAP_COLOR.CHEST,
      MAP_COLOR.ROBOT,
    ]
    expect(order).toEqual([...order].sort((a, b) => a - b))
    expect(new Set(order).size).toBe(Object.keys(MAP_COLOR).length)
  })

  it("associe une variable CSS à chaque couleur sauf EMPTY", () => {
    for (const color of Object.values(MAP_COLOR)) {
      if (color === MAP_COLOR.EMPTY) {
        expect(MAP_COLOR_VARS[color]).toBeUndefined()
      } else {
        expect(MAP_COLOR_VARS[color]).toMatch(/^--color-/)
      }
    }
  })

  it("cache une case en pendingReveal, comme MineCell", () => {
    expect(cellMapColor(revealed({ isMine: true, pendingReveal: true }))).toBe(
      MAP_COLOR.EMPTY,
    )
  })

  it("un cœur pas encore vu reste une case révélée ordinaire", () => {
    expect(cellMapColor(revealed({ isHeart: true }))).toBe(MAP_COLOR.REVEALED)
    expect(
      cellMapColor(revealed({ isHeart: true, heartFogConfirmed: true })),
    ).toBe(MAP_COLOR.HEART)
  })
})

describe("touchedBounds", () => {
  it("renvoie null sans case touchée", () => {
    expect(touchedBounds(cellMap([cell(5, 5), cell(-3, 2)]))).toBeNull()
  })

  it("englobe révélées et drapeaux, ignore les cases seulement matérialisées", () => {
    const cells = cellMap([
      cell(-4, 2, { revealed: true }),
      cell(7, -1, { flagged: true }),
      cell(3, 9, { revealed: true, pendingReveal: true }),
      cell(100, 100),
    ])
    expect(touchedBounds(cells)).toEqual({
      minX: -4,
      minY: -1,
      maxX: 7,
      maxY: 9,
    })
  })
})

describe("buildBaseLayer", () => {
  it("place un pixel par case à partir du coin haut-gauche de la boîte", () => {
    const cells = cellMap([
      cell(-2, -1, { revealed: true }),
      cell(1, 0, { flagged: true }),
      cell(0, 1, { revealed: true, isMine: true }),
    ])
    const layer = buildBaseLayer(cells, touchedBounds(cells))

    expect(layer).toMatchObject({
      x: -2,
      y: -1,
      width: 4,
      height: 3,
      cellsPerPixel: 1,
    })
    const at = (x, y) => layer.data[(y - layer.y) * layer.width + (x - layer.x)]
    expect(at(-2, -1)).toBe(MAP_COLOR.REVEALED)
    expect(at(1, 0)).toBe(MAP_COLOR.FLAG)
    expect(at(0, 1)).toBe(MAP_COLOR.MINE)
    expect(at(0, 0)).toBe(MAP_COLOR.EMPTY)
  })

  it("au-delà de maxSize, regroupe les cases par puissance de 2", () => {
    const cells = cellMap([
      cell(0, 0, { revealed: true }),
      cell(9, 0, { revealed: true }),
    ])
    const layer = buildBaseLayer(cells, touchedBounds(cells), 4)

    // 10 cases : 10 > 4, 5 > 4, 3 <= 4 → 4 cases par pixel.
    expect(layer.cellsPerPixel).toBe(4)
    expect(layer.width).toBe(3)
    expect(layer.height).toBe(1)
  })

  it("plafonne l'image de base à 4096 px par défaut", () => {
    const cells = cellMap([
      cell(0, 0, { revealed: true }),
      cell(5000, 0, { revealed: true }),
    ])
    const layer = buildBaseLayer(cells, touchedBounds(cells))
    expect(layer.cellsPerPixel).toBe(2)
    expect(layer.width).toBeLessThanOrEqual(4096)
  })

  it("garde la couleur la plus prioritaire d'un bloc regroupé", () => {
    const cells = cellMap([
      cell(0, 0, { revealed: true }),
      cell(1, 0, { flagged: true }),
      cell(0, 1, { revealed: true, isMine: true }),
      cell(7, 0, { revealed: true }),
    ])
    const layer = buildBaseLayer(cells, touchedBounds(cells), 4)
    expect(layer.cellsPerPixel).toBe(2)
    expect(layer.data[0]).toBe(MAP_COLOR.MINE)
  })
})

describe("downsampleLayer", () => {
  it("divise par deux (arrondi au-dessus) et garde le max de chaque bloc 2×2", () => {
    const layer = {
      x: 3,
      y: -2,
      width: 3,
      height: 3,
      cellsPerPixel: 1,
      // prettier-ignore
      data: Uint8Array.from([
        MAP_COLOR.REVEALED, MAP_COLOR.HEART, MAP_COLOR.EMPTY,
        MAP_COLOR.FLAG, MAP_COLOR.REVEALED, MAP_COLOR.EMPTY,
        MAP_COLOR.EMPTY, MAP_COLOR.EMPTY, MAP_COLOR.MINE,
      ]),
    }
    const half = downsampleLayer(layer)

    expect(half).toMatchObject({
      x: 3,
      y: -2,
      width: 2,
      height: 2,
      cellsPerPixel: 2,
    })
    expect([...half.data]).toEqual([
      MAP_COLOR.HEART,
      MAP_COLOR.EMPTY,
      MAP_COLOR.EMPTY,
      MAP_COLOR.MINE,
    ])
  })

  it("garde visible un chemin d'une case de large sur 2 000 cases d'envergure", () => {
    const SPAN = 2000
    const pathY = 1237
    const pathX = 611
    const cells = []
    for (let i = 0; i < SPAN; i++) {
      cells.push(cell(i, pathY, { revealed: true }))
      cells.push(cell(pathX, i, { revealed: true }))
    }
    const map = cellMap(cells)
    let layer = buildBaseLayer(map, touchedBounds(map))
    expect(layer.width).toBe(SPAN)

    while (layer.width > 1 || layer.height > 1) {
      layer = downsampleLayer(layer)
      const row = Math.floor(pathY / layer.cellsPerPixel)
      const col = Math.floor(pathX / layer.cellsPerPixel)
      for (let x = 0; x < layer.width; x++) {
        expect(layer.data[row * layer.width + x]).not.toBe(MAP_COLOR.EMPTY)
      }
      for (let y = 0; y < layer.height; y++) {
        expect(layer.data[y * layer.width + col]).not.toBe(MAP_COLOR.EMPTY)
      }
    }
    expect(layer.data[0]).toBe(MAP_COLOR.REVEALED)
  })

  it("une mine isolée au milieu des révélées survit à toutes les réductions", () => {
    const cells = []
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        cells.push(cell(x, y, { revealed: true, isMine: x === 37 && y === 5 }))
      }
    }
    const map = cellMap(cells)
    let layer = buildBaseLayer(map, touchedBounds(map))
    while (layer.width > 1) {
      layer = downsampleLayer(layer)
      const i =
        Math.floor(5 / layer.cellsPerPixel) * layer.width +
        Math.floor(37 / layer.cellsPerPixel)
      expect(layer.data[i]).toBe(MAP_COLOR.MINE)
    }
  })
})

describe("pyramidLevelFor", () => {
  it("reste sur l'image de base tant qu'une case fait au moins un pixel physique", () => {
    expect(pyramidLevelFor(9)).toBe(0)
    expect(pyramidLevelFor(1)).toBe(0)
  })

  it("monte d'un palier à chaque division par deux", () => {
    expect(pyramidLevelFor(0.5)).toBe(1)
    expect(pyramidLevelFor(0.3)).toBe(2)
    expect(pyramidLevelFor(0.25)).toBe(2)
    expect(pyramidLevelFor(0.2)).toBe(3)
  })

  it("tient compte d'une image de base déjà regroupée", () => {
    expect(pyramidLevelFor(0.5, 2)).toBe(0)
    expect(pyramidLevelFor(0.25, 2)).toBe(1)
  })

  it("ne renvoie jamais de palier négatif ou NaN", () => {
    expect(pyramidLevelFor(0)).toBe(0)
    expect(pyramidLevelFor(NaN)).toBe(0)
  })
})

describe("adaptiveMinCellSize", () => {
  it("vaut MAP_FLOOR_MAX sur une petite zone ou sans mesure du viewport", () => {
    const small = { minX: -5, minY: -5, maxX: 5, maxY: 5 }
    expect(adaptiveMinCellSize(small, 1000, 600)).toBe(MAP_FLOOR_MAX)
    expect(adaptiveMinCellSize(null, 1000, 600)).toBe(MAP_FLOOR_MAX)
    expect(adaptiveMinCellSize(small, 0, 0)).toBe(MAP_FLOOR_MAX)
  })

  it("fait tenir toute la zone plus la marge, bien sous 1 px si besoin", () => {
    const bounds = { minX: 0, minY: 0, maxX: 1999, maxY: 499 }
    const size = adaptiveMinCellSize(bounds, 400, 800, {
      marginRatio: 0.1,
      marginCells: 8,
    })
    // 2000 × 1.2 + 16 = 2416 cases à faire tenir dans 400 px.
    expect(size).toBeCloseTo(400 / 2416)
    expect(2000 * size).toBeLessThan(400)
  })

  it("baisse quand la zone grandit", () => {
    const a = adaptiveMinCellSize(
      { minX: 0, minY: 0, maxX: 300, maxY: 0 },
      900,
      900,
    )
    const b = adaptiveMinCellSize(
      { minX: 0, minY: 0, maxX: 600, maxY: 0 },
      900,
      900,
    )
    expect(b).toBeLessThan(a)
  })
})

describe("parseHexColor", () => {
  it("lit les formats hex courts et longs", () => {
    expect(parseHexColor("#ddd")).toEqual([221, 221, 221, 255])
    expect(parseHexColor(" #f9a825 ")).toEqual([249, 168, 37, 255])
    expect(parseHexColor("#ff408180")).toEqual([255, 64, 129, 128])
  })

  it("retombe sur du noir opaque si la valeur est illisible", () => {
    expect(parseHexColor("")).toEqual([0, 0, 0, 255])
    expect(parseHexColor("rebeccapurple")).toEqual([0, 0, 0, 255])
  })
})

describe("layerToRgba", () => {
  it("laisse EMPTY transparent et applique la palette ailleurs", () => {
    const palette = []
    palette[MAP_COLOR.EMPTY] = [0, 0, 0, 0]
    palette[MAP_COLOR.REVEALED] = [1, 2, 3, 255]
    palette[MAP_COLOR.FLAG] = [4, 5, 6, 255]
    palette[MAP_COLOR.HEART] = [7, 8, 9, 255]
    palette[MAP_COLOR.MINE] = [10, 11, 12, 255]
    const layer = {
      width: 2,
      height: 1,
      data: Uint8Array.from([MAP_COLOR.EMPTY, MAP_COLOR.MINE]),
    }
    expect([...layerToRgba(layer, palette)]).toEqual([
      0, 0, 0, 0, 10, 11, 12, 255,
    ])
  })
})
