// Codec compact des cases touchées d'une partie Infini (snapshot localStorage).
// Le monde étant déterministe, seul l'état des cases compte : un bitmap par
// bloc de CHUNK×CHUNK (2 bits par case : révélée, marquée), plus une liste
// d'exceptions pour ce qui ne tient pas dans 2 bits (inclinaison, wrong,
// cœur confirmé). ~80× plus petit que le JSON d'objets (50 000 cases : 5 Mo → 70 Ko).

const CHUNK = 32
const FORMAT = 1

const REVEALED = 1
const FLAGGED = 2
const WRONG = 1
const HEART_CONFIRMED = 2

function toBase64(bytes) {
  let binary = ""
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

function fromBase64(text) {
  const binary = atob(text)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

// cells : objets { x, y, revealed, flagged, wrong, tiltDeg, heartFogConfirmed }.
export function encodeCells(cells) {
  const maps = new Map()
  const extras = []

  for (const cell of cells) {
    const state = (cell.revealed ? REVEALED : 0) | (cell.flagged ? FLAGGED : 0)

    if (state !== 0) {
      const cx = Math.floor(cell.x / CHUNK)
      const cy = Math.floor(cell.y / CHUNK)
      const key = `${cx},${cy}`
      let map = maps.get(key)
      if (!map) {
        map = new Uint8Array((CHUNK * CHUNK) / 4)
        maps.set(key, map)
      }
      const index = (cell.y - cy * CHUNK) * CHUNK + (cell.x - cx * CHUNK)
      map[index >> 2] |= state << ((index & 3) * 2)
    }

    // Inclinaison au dixième de degré : purement cosmétique.
    const tilt = Math.round(cell.tiltDeg * 10)
    const flags =
      (cell.wrong ? WRONG : 0) | (cell.heartFogConfirmed ? HEART_CONFIRMED : 0)

    if (tilt !== 0 || flags !== 0) {
      extras.push(
        flags ? [cell.x, cell.y, tilt, flags] : [cell.x, cell.y, tilt],
      )
    }
  }

  const encodedMaps = {}
  for (const [key, map] of maps) {
    encodedMaps[key] = toBase64(map)
  }

  return { format: FORMAT, maps: encodedMaps, extras }
}

// Accepte aussi l'ancien format (tableau d'objets), renvoyé tel quel.
export function decodeCells(encoded) {
  if (Array.isArray(encoded)) {
    return encoded
  }

  if (encoded?.format !== FORMAT) {
    throw new Error("unknown cell format")
  }

  const byKey = new Map()
  const at = (x, y) => {
    const key = `${x},${y}`
    let cell = byKey.get(key)
    if (!cell) {
      cell = {
        x,
        y,
        revealed: false,
        flagged: false,
        wrong: false,
        tiltDeg: 0,
        heartFogConfirmed: false,
      }
      byKey.set(key, cell)
    }
    return cell
  }

  for (const [key, text] of Object.entries(encoded.maps)) {
    const [cx, cy] = key.split(",").map(Number)
    const map = fromBase64(text)

    for (let index = 0; index < CHUNK * CHUNK; index++) {
      const state = (map[index >> 2] >> ((index & 3) * 2)) & 3
      if (state !== 0) {
        const cell = at(
          cx * CHUNK + (index % CHUNK),
          cy * CHUNK + Math.floor(index / CHUNK),
        )
        cell.revealed = (state & REVEALED) !== 0
        cell.flagged = (state & FLAGGED) !== 0
      }
    }
  }

  for (const [x, y, tilt, flags = 0] of encoded.extras) {
    const cell = at(x, y)
    cell.tiltDeg = tilt / 10
    cell.wrong = (flags & WRONG) !== 0
    cell.heartFogConfirmed = (flags & HEART_CONFIRMED) !== 0
  }

  return [...byKey.values()]
}
