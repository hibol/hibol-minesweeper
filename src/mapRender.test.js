import { describe, it, expect, vi } from "vitest"
import {
  MAP_COLOR,
  MAP_COLOR_VARS,
  MAP_FLOOR_MAX,
  adaptiveMinCellSize,
  applyCellChanges,
  boundsContain,
  buildBaseLayer,
  cellMapColor,
  downsampleLayer,
  drawMapExport,
  extendBounds,
  layerBounds,
  layerToRgba,
  paddedBounds,
  parseHexColor,
  pyramidLevelFor,
  touchedBounds,
  unionBounds,
} from "./mapRender"

function cell(x, y, props = {}) {
  return {
    x,
    y,
    revealed: false,
    flagged: false,
    isMine: false,
    isHeart: false,
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

  it("montre le robot en marche, case révélée ou non", () => {
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
      cell(3, 9, { revealed: true }),
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

describe("layerToRgba — rectangle", () => {
  it("ne convertit que le rectangle demandé (bords inclus)", () => {
    const palette = []
    palette[MAP_COLOR.REVEALED] = [1, 2, 3, 255]
    palette[MAP_COLOR.MINE] = [10, 11, 12, 255]
    const layer = {
      width: 3,
      height: 2,
      // prettier-ignore
      data: Uint8Array.from([
        MAP_COLOR.EMPTY, MAP_COLOR.REVEALED, MAP_COLOR.EMPTY,
        MAP_COLOR.EMPTY, MAP_COLOR.MINE, MAP_COLOR.REVEALED,
      ]),
    }
    const out = layerToRgba(layer, palette, { x0: 1, y0: 1, x1: 2, y1: 1 })
    expect([...out]).toEqual([10, 11, 12, 255, 1, 2, 3, 255])
  })
})

describe("boîtes : extendBounds / unionBounds / boundsContain", () => {
  const box = { minX: 0, minY: 0, maxX: 4, maxY: 4 }

  it("extendBounds garde le même objet tant qu'aucune case touchée n'en sort", () => {
    expect(extendBounds(box, [cell(2, 2, { revealed: true })])).toBe(box)
    expect(extendBounds(box, [cell(9, 9)])).toBe(box) // non touchée : ignorée
    expect(extendBounds(box, [cell(6, -1, { revealed: true })])).toEqual({
      minX: 0,
      minY: -1,
      maxX: 6,
      maxY: 4,
    })
    expect(extendBounds(null, [cell(3, 1, { flagged: true })])).toEqual({
      minX: 3,
      minY: 1,
      maxX: 3,
      maxY: 1,
    })
    expect(extendBounds(null, [])).toBeNull()
  })

  it("unionBounds renvoie la première boîte si elle contient l'autre", () => {
    expect(unionBounds(box, null)).toBe(box)
    expect(unionBounds(box, { minX: 1, minY: 1, maxX: 2, maxY: 2 })).toBe(box)
    const b = { minX: 3, minY: 3, maxX: 8, maxY: 5 }
    expect(unionBounds(null, b)).toBe(b)
    expect(unionBounds(box, b)).toEqual({ minX: 0, minY: 0, maxX: 8, maxY: 5 })
  })

  it("boundsContain : null intérieur toujours contenu, extérieur null jamais", () => {
    expect(boundsContain(box, null)).toBe(true)
    expect(boundsContain(null, box)).toBe(false)
    expect(boundsContain(paddedBounds(box, 2), box)).toBe(true)
    expect(boundsContain(box, paddedBounds(box, 1))).toBe(false)
  })
})

describe("applyCellChanges (mise à jour incrémentale)", () => {
  // Pyramide complète construite à partir des cases, comme MapCanvas.
  function pyramid(cells, bounds, maxSize) {
    const layers = [buildBaseLayer(cells, bounds, maxSize)]
    while (layers.at(-1).width > 1 || layers.at(-1).height > 1) {
      layers.push(downsampleLayer(layers.at(-1)))
    }
    return layers
  }

  // Référence : tout reconstruit depuis zéro sur l'état courant des cases.
  function expectSameAsRebuild(layers, cells, bounds, maxSize) {
    const fresh = pyramid(cells, bounds, maxSize)
    expect(layers.map((l) => [...l.data])).toEqual(
      fresh.map((l) => [...l.data]),
    )
  }

  function corridor() {
    const cells = []
    for (let x = 0; x < 8; x++) {
      for (let y = 0; y < 4; y++) {
        cells.push(cell(x, y, { revealed: x < 4 }))
      }
    }
    return cellMap(cells)
  }
  const bounds = { minX: 0, minY: 0, maxX: 7, maxY: 3 }

  it("un pas de robot ne change que les pixels concernés, dans chaque palier", () => {
    const cells = corridor()
    const layers = pyramid(cells, bounds)

    const from = cells.get("3,1")
    const to = cells.get("4,1")
    from.robotHere = false
    to.revealed = true
    to.robotHere = true
    const { outside, rects } = applyCellChanges(layers, cells, [from, to])

    expect(outside).toBe(false)
    expect(rects[0]).toEqual({ x0: 4, y0: 1, x1: 4, y1: 1 })
    expectSameAsRebuild(layers, cells, bounds)
    expect(layers.at(-1).data[0]).toBe(MAP_COLOR.ROBOT)
  })

  it("une case qui BAISSE de priorité (le robot la quitte) redescend jusqu'au sommet", () => {
    const cells = corridor()
    const robotCell = cells.get("2,2")
    robotCell.robotHere = true
    const layers = pyramid(cells, bounds)
    expect(layers.at(-1).data[0]).toBe(MAP_COLOR.ROBOT)

    robotCell.robotHere = false
    const { rects } = applyCellChanges(layers, cells, [robotCell])

    expect(rects.every((r) => r !== null)).toBe(true)
    expect(layers.at(-1).data[0]).toBe(MAP_COLOR.REVEALED)
    expectSameAsRebuild(layers, cells, bounds)
  })

  it("un pixel parent garde la priorité d'un AUTRE enfant quand une case baisse", () => {
    const cells = corridor()
    cells.get("0,0").isMine = true
    const robotCell = cells.get("1,1")
    robotCell.robotHere = true
    const layers = pyramid(cells, bounds)

    robotCell.robotHere = false
    applyCellChanges(layers, cells, [robotCell])

    expect(layers[1].data[0]).toBe(MAP_COLOR.MINE) // bloc 2×2 (0..1, 0..1)
    expectSameAsRebuild(layers, cells, bounds)
  })

  it("recalcule tout le bloc quand l'image de base regroupe plusieurs cases", () => {
    const cells = corridor()
    const layers = pyramid(cells, bounds, 4) // 8 cases → 2 cases par pixel
    expect(layers[0].cellsPerPixel).toBe(2)

    const flagged = cells.get("5,2")
    flagged.flagged = true
    applyCellChanges(layers, cells, [flagged])
    expectSameAsRebuild(layers, cells, bounds, 4)

    flagged.flagged = false
    applyCellChanges(layers, cells, [flagged])
    expectSameAsRebuild(layers, cells, bounds, 4)
  })

  it("signale une case hors de l'image (il faut reconstruire) sans rien écrire", () => {
    const cells = corridor()
    const layers = pyramid(cells, bounds)
    const before = layers.map((l) => [...l.data])
    const far = cell(20, 1, { revealed: true })
    cells.set("20,1", far)

    const { outside } = applyCellChanges(layers, cells, [far])

    expect(outside).toBe(true)
    expect(layers.map((l) => [...l.data])).toEqual(before)
  })

  it("une image élargie d'une marge absorbe une case juste hors de la zone touchée", () => {
    const cells = corridor()
    const padded = paddedBounds(touchedBounds(cells), 4)
    const layers = pyramid(cells, padded)
    expect(layerBounds(layers[0])).toEqual(padded)

    const next = cells.get("4,0")
    next.revealed = true
    const { outside } = applyCellChanges(layers, cells, [next])

    expect(outside).toBe(false)
    expectSameAsRebuild(layers, cells, padded)
  })
})

describe("drawMapExport", () => {
  const colors = {
    board: "#board",
    revealed: "#revealed",
    flag: "#flag",
    mine: "#mine",
    heart: "#heart",
  }

  // jsdom n'a pas de contexte 2D : un faux canvas note chaque fillRect avec la
  // couleur courante.
  function fakeCanvas() {
    const fills = []
    const ctx = {
      fillStyle: "",
      fillRect(x, y, w, h) {
        fills.push({ style: this.fillStyle, x, y, w, h })
      },
    }
    const canvas = { width: 0, height: 0, getContext: vi.fn(() => ctx) }
    return { canvas, fills }
  }

  it("ne touche pas au canvas sans case touchée", () => {
    const { canvas, fills } = fakeCanvas()
    const cells = cellMap([cell(0, 0), cell(3, 3)])

    expect(drawMapExport(canvas, cells, colors)).toBe(false)
    expect(canvas.getContext).not.toHaveBeenCalled()
    expect(canvas.width).toBe(0)
    expect(fills).toEqual([])
  })

  it("dimensionne le canvas sur la zone touchée et peint le fond en premier", () => {
    const { canvas, fills } = fakeCanvas()
    const cells = cellMap([
      cell(-2, 5, { revealed: true }),
      cell(1, 7, { revealed: true }),
    ])

    expect(drawMapExport(canvas, cells, colors)).toBe(true)
    // 4 × 3 cases à 6 px.
    expect(canvas.width).toBe(24)
    expect(canvas.height).toBe(18)
    expect(fills[0]).toEqual({ style: "#board", x: 0, y: 0, w: 24, h: 18 })
  })

  it("place chaque case relativement au coin haut-gauche, une couleur par type", () => {
    const { canvas, fills } = fakeCanvas()
    const cells = cellMap([
      cell(10, 20, { revealed: true }),
      cell(11, 20, { revealed: true, isMine: true }),
      cell(12, 20, { revealed: true, isHeart: true }),
      cell(10, 21, { flagged: true }),
      // Un drapeau l'emporte sur le reste (une mine non révélée, flaguée).
      cell(11, 21, { flagged: true, isMine: true }),
    ])

    drawMapExport(canvas, cells, colors)

    // slice(1) : le fond part aussi du coin (0, 0).
    const at = (x, y) =>
      fills.slice(1).find((f) => f.x === x * 6 && f.y === y * 6)
    expect(at(0, 0).style).toBe("#revealed")
    expect(at(1, 0).style).toBe("#mine")
    expect(at(2, 0).style).toBe("#heart")
    expect(at(0, 1).style).toBe("#flag")
    expect(at(1, 1).style).toBe("#flag")
    expect(at(0, 0)).toMatchObject({ w: 6, h: 6 })
  })

  it("ignore les cases seulement matérialisées", () => {
    const { canvas, fills } = fakeCanvas()
    const cells = cellMap([cell(0, 0, { revealed: true }), cell(1, 0)])

    drawMapExport(canvas, cells, colors)

    // Le fond et la seule case révélée ; la boîte ne s'étend pas à (1, 0).
    expect(fills).toHaveLength(2)
    expect(canvas.width).toBe(6)
  })

  it("réduit les px par case quand la carte est très large", () => {
    const { canvas } = fakeCanvas()
    const cells = cellMap([
      cell(0, 0, { revealed: true }),
      cell(1999, 0, { revealed: true }),
    ])

    drawMapExport(canvas, cells, colors)

    // 4000 / 2000 cases = 2 px par case, soit 4000 px de large.
    expect(canvas.width).toBe(4000)
    expect(canvas.height).toBe(2)
  })

  it("ne descend pas sous 1 px par case", () => {
    const { canvas } = fakeCanvas()
    const cells = cellMap([
      cell(0, 0, { revealed: true }),
      cell(5999, 0, { revealed: true }),
    ])

    drawMapExport(canvas, cells, colors)

    expect(canvas.width).toBe(6000)
  })

  it("ne parcourt les cases du jeu qu'une fois", () => {
    const { canvas } = fakeCanvas()
    const cells = cellMap([cell(0, 0, { revealed: true })])
    const values = vi.spyOn(cells, "values")

    drawMapExport(canvas, cells, colors)

    expect(values).toHaveBeenCalledTimes(1)
  })
})
