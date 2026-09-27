// Génère l'icône de lancement et le splash Android à partir du drapeau
// pixel-art de public/favicon.svg (source unique, pas d'image maître à part).
// Rendu au plus proche voisin, à une taille de pixel entière par densité :
// un redimensionnement lissé (type @capacitor/assets) floute le pixel-art.
// Usage : node scripts/android-assets.js   (réécrit android/app/src/main/res)
import { readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { deflateSync } from "node:zlib"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const RES = join(ROOT, "android/app/src/main/res")
// Même fond que public/pwa-*.png.
const BG = [0x1a, 0x1a, 0x1a, 255]
const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 }
// Tailles héritées du template Capacitor (px), une par orientation/densité.
const SPLASHES = {
  drawable: [480, 320],
  "drawable-land-mdpi": [480, 320],
  "drawable-land-hdpi": [800, 480],
  "drawable-land-xhdpi": [1280, 720],
  "drawable-land-xxhdpi": [1600, 960],
  "drawable-land-xxxhdpi": [1920, 1280],
  "drawable-port-mdpi": [320, 480],
  "drawable-port-hdpi": [480, 800],
  "drawable-port-xhdpi": [720, 1280],
  "drawable-port-xxhdpi": [960, 1600],
  "drawable-port-xxxhdpi": [1280, 1920],
}

function loadFlag() {
  const svg = readFileSync(join(ROOT, "public/favicon.svg"), "utf8")
  const cells = [
    ...svg.matchAll(/<rect x="(\d+)" y="(\d+)"[^>]*fill="#([0-9a-f]{6})"/gi),
  ].map(([, x, y, hex]) => ({
    x: +x,
    y: +y,
    rgba: [...hex.match(/../g).map((h) => parseInt(h, 16)), 255],
  }))
  const minX = Math.min(...cells.map((c) => c.x))
  const minY = Math.min(...cells.map((c) => c.y))
  return {
    cells: cells.map((c) => ({ ...c, x: c.x - minX, y: c.y - minY })),
    w: Math.max(...cells.map((c) => c.x)) - minX + 1,
    h: Math.max(...cells.map((c) => c.y)) - minY + 1,
  }
}

// bgAt(x, y) → couleur RGBA du fond, ou null pour transparent.
function render(width, height, unit, flag, bgAt) {
  const px = Buffer.alloc(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const c = bgAt(x, y)
      if (c) px.set(c, (y * width + x) * 4)
    }
  }
  const ox = Math.floor((width - flag.w * unit) / 2)
  const oy = Math.floor((height - flag.h * unit) / 2)
  for (const cell of flag.cells) {
    for (let dy = 0; dy < unit; dy++) {
      for (let dx = 0; dx < unit; dx++) {
        px.set(
          cell.rgba,
          ((oy + cell.y * unit + dy) * width + ox + cell.x * unit + dx) * 4,
        )
      }
    }
  }
  return encodePng(width, height, px)
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(buf) {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, "ascii"), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

// PNG RGBA 8 bits minimal, filtre 0 sur chaque ligne.
function encodePng(width, height, px) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr.set([8, 6, 0, 0, 0], 8)
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) {
    px.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ])
}

const flag = loadFlag()
const out = (dir, name, png) => writeFileSync(join(RES, dir, name), png)

for (const [name, s] of Object.entries(DENSITIES)) {
  const dir = `mipmap-${name}`
  // Icône adaptative (API 26+) : calque 108dp, zone sûre = cercle de 66dp.
  // 6dp par pixel du drapeau → diagonale du drapeau 6×8 = 60dp, dans le cercle.
  out(
    dir,
    "ic_launcher_foreground.png",
    render(108 * s, 108 * s, 6 * s, flag, () => null),
  )
  // Icônes figées (API 23-25) : 48dp, fond carré arrondi ou rond.
  const size = 48 * s
  const r = 8 * s
  const inRounded = (x, y) => {
    const cx = Math.min(Math.max(x + 0.5, r), size - r)
    const cy = Math.min(Math.max(y + 0.5, r), size - r)
    return (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r
  }
  const inCircle = (x, y) =>
    (x + 0.5 - size / 2) ** 2 + (y + 0.5 - size / 2) ** 2 <= (size / 2) ** 2
  out(
    dir,
    "ic_launcher.png",
    render(size, size, 4 * s, flag, (x, y) => (inRounded(x, y) ? BG : null)),
  )
  out(
    dir,
    "ic_launcher_round.png",
    render(size, size, 4 * s, flag, (x, y) => (inCircle(x, y) ? BG : null)),
  )
}

// Splash pré-Android 12 (Android 12+ affiche l'icône adaptative sur
// windowSplashScreenBackground, cf. styles.xml) : drapeau haut d'1/4 du petit côté.
for (const [dir, [w, h]] of Object.entries(SPLASHES)) {
  out(
    dir,
    "splash.png",
    render(w, h, Math.floor(Math.min(w, h) / 32), flag, () => BG),
  )
}

console.log(`Icônes et splash écrits dans ${RES}`)
