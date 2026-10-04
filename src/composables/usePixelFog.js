import { onMounted, onUnmounted, watch } from "vue"
import { theme } from "../state/settings"
import { mulberry32 } from "../rng"

// Refonte du voile en <canvas> pixelisé et bruité — remplace l'ancien
// radial-gradient CSS à bandes nettes (roadmap: cf. handoff de design dans
// temp/design_handoff_pixelated_fog/README.md pour l'algorithme d'origine
// et les captures du prototype). Tuning à l'oeil : ces constantes sont la
// première chose à ajuster en testant intensité/transparence du voile.

// Taille (px) d'un bloc de voile — plus petit = grain plus fin (plus proche
// d'un flou), plus grand = plus "8-bit" mais moins précis autour des halos.
const PIXEL_SIZE = 8

// Paliers d'opacité (quantification) : bandes nettes façon brouillard de
// guerre 8-bit plutôt qu'un dégradé continu. Plus de paliers = plus lisse.
const STEPS = 8

// Voile à une seule teinte (--fog-color, par thème), le bruit module
// l'OPACITÉ. Même algorithme dans les deux thèmes : la teinte se démarque du
// plateau d'autant en sombre qu'en clair (cf. --fog-color dans style.css).

// Amplitude du bruit sur l'opacité (0 = voile uniforme, 1 = blobs très
// contrastés).
const BLOB_STRENGTH = 0.4

// Largeur (en unités de distance normalisée, cf. `d` dans draw()) du fondu
// du voile lui-même passé la zone dégagée.
const FALLOFF_WIDTH = 0.35

// Largeur sur laquelle la contribution des blobs monte en puissance juste
// après le bord de la zone dégagée, pour que ce bord reste net (pas de blob
// qui déborde visuellement dans la zone claire).
const BLOB_MASK_WIDTH = 0.12

function clamp01(v) {
  return Math.min(1, Math.max(0, v))
}

function smoothstep(t) {
  return t * t * (3 - 2 * t)
}

function lerp(a, b, t) {
  return a + (b - a) * t
}

// Bruit de valeur 2D, lattice de valeurs aléatoires espacées de
// `latticeSpacing` blocs, interpolées bilinéairement (smoothstep) — deux
// octaves de ceci (grosses formes + variation interne) donnent les blobs.
function valueNoise2D(cols, rows, seed, latticeSpacing) {
  const rng = mulberry32(seed)
  const gw = Math.ceil(cols / latticeSpacing) + 2
  const gh = Math.ceil(rows / latticeSpacing) + 2
  const grid = Array.from({ length: gh }, () =>
    Array.from({ length: gw }, () => rng()),
  )
  const out = new Float32Array(cols * rows)

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const gx = c / latticeSpacing
      const gy = r / latticeSpacing
      const x0 = Math.floor(gx)
      const y0 = Math.floor(gy)
      const tx = smoothstep(gx - x0)
      const ty = smoothstep(gy - y0)
      const v00 = grid[y0][x0]
      const v10 = grid[y0][x0 + 1]
      const v01 = grid[y0 + 1][x0]
      const v11 = grid[y0 + 1][x0 + 1]
      const vx0 = lerp(v00, v10, tx)
      const vx1 = lerp(v01, v11, tx)
      out[r * cols + c] = lerp(vx0, vx1, ty)
    }
  }

  return out
}

function parseFogColor(container) {
  const raw = getComputedStyle(container).getPropertyValue("--fog-color")
  const [r, g, b] = raw.trim().split(/\s+/).map(Number)
  return [r || 0, g || 0, b || 0]
}

// canvasRef/containerRef: refs DOM (canvas à dessiner, conteneur .game-area
// dont il épouse la taille). active: booléen réactif (mode infini/trésor
// seulement — le classique n'a pas de voile). radiusX/radiusY: rayons (px)
// de la zone dégagée, déjà calculés par useFogOfWar (mêmes formules que
// l'ancien --clear-radius-x/y, juste consommées ici en JS plutôt qu'en CSS).
// haloPositions: halos des robots en marche (px, relatifs au conteneur) qui
// percent le voile ; haloRadius: leur rayon (px). seed: seed de la partie
// (nouvelle seed = nouveaux blobs).
//
// Contrairement au reste du jeu, ceci n'est PAS une boucle rAF : les blobs
// sont figés, on ne redessine (au plus une fois par frame) que sur des
// changements d'état discrets
// (taille du conteneur, rayons du voile, halos des robots, nouvelle seed,
// bascule clair/sombre — `theme` importé directement depuis settings.js,
// sinon un changement de thème en cours de partie laisse le canvas affiché
// avec les couleurs de l'ancien thème jusqu'au prochain redraw naturel).
export function usePixelFog(
  canvasRef,
  containerRef,
  { active, radiusX, radiusY, haloPositions, haloRadius, seed },
) {
  let noiseOctave1 = null
  let noiseOctave2 = null
  let noiseCols = 0
  let noiseRows = 0
  let noiseSeed = null
  let resizeObserver = null

  function ensureNoise(cols, rows) {
    const currentSeed = seed.value
    if (
      noiseOctave1 &&
      noiseCols === cols &&
      noiseRows === rows &&
      noiseSeed === currentSeed
    ) {
      return
    }

    noiseOctave1 = valueNoise2D(cols, rows, currentSeed, 6)
    noiseOctave2 = valueNoise2D(cols, rows, currentSeed + 999, 2)
    noiseCols = cols
    noiseRows = rows
    noiseSeed = currentSeed
  }

  function draw() {
    const canvas = canvasRef.value
    const container = containerRef.value
    if (!canvas || !container) {
      return
    }

    if (!active.value) {
      canvas.width = 0
      canvas.height = 0
      return
    }

    const width = container.clientWidth
    const height = container.clientHeight
    if (width === 0 || height === 0) {
      return
    }

    canvas.width = width
    canvas.height = height

    const ctx = canvas.getContext("2d")
    const cols = Math.ceil(width / PIXEL_SIZE)
    const rows = Math.ceil(height / PIXEL_SIZE)
    ensureNoise(cols, rows)

    const [fr, fg, fb] = parseFogColor(container)
    const cx = width / 2
    const cy = height / 2
    const radX = Math.max(1, radiusX.value)
    const radY = Math.max(1, radiusY.value)
    const halos = haloPositions.value
    const haloRadiusPx = haloRadius.value

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const px = c * PIXEL_SIZE + PIXEL_SIZE / 2
        const py = r * PIXEL_SIZE + PIXEL_SIZE / 2

        const dx = (px - cx) / radX
        const dy = (py - cy) / radY
        const d = Math.sqrt(dx * dx + dy * dy)

        // Toujours transparent dans la zone dégagée : c'est ce qui garantit
        // que les blobs ne débordent jamais dedans (aucune exception plus
        // bas ne peut faire remonter l'alpha au-dessus de 0 ici).
        if (d <= 1) {
          continue
        }

        // Même logique que l'intersection de masques CSS d'avant : un point
        // dans le halo d'un robot en marche reste transparent, quel que
        // soit ce que dirait le voile normal à cet endroit.
        let insideHalo = false
        for (const halo of halos) {
          const hdx = px - halo.x
          const hdy = py - halo.y
          if (hdx * hdx + hdy * hdy <= haloRadiusPx * haloRadiusPx) {
            insideHalo = true
            break
          }
        }
        if (insideHalo) {
          continue
        }

        const base = clamp01((d - 1) / FALLOFF_WIDTH)
        const blobMask = clamp01((d - 1) / BLOB_MASK_WIDTH)
        const idx = r * cols + c
        const noiseVal = noiseOctave1[idx] * 0.7 + noiseOctave2[idx] * 0.3

        let alpha = clamp01(base + (noiseVal - 0.5) * BLOB_STRENGTH * blobMask)
        alpha = Math.round(alpha * STEPS) / STEPS
        if (alpha <= 0) {
          continue
        }

        ctx.fillStyle = `rgba(${fr}, ${fg}, ${fb}, ${alpha})`
        ctx.fillRect(c * PIXEL_SIZE, r * PIXEL_SIZE, PIXEL_SIZE, PIXEL_SIZE)
      }
    }
  }

  // Au plus un dessin par frame : un pincement change les rayons à chaque
  // événement, parfois plusieurs fois entre deux frames.
  let frame = null

  function scheduleDraw() {
    if (frame === null) {
      frame = requestAnimationFrame(() => {
        frame = null
        draw()
      })
    }
  }

  // Dessin immédiat (montage, resize, redraw forcé) : rend caduc celui en attente.
  function drawNow() {
    if (frame !== null) {
      cancelAnimationFrame(frame)
      frame = null
    }
    draw()
  }

  onMounted(() => {
    drawNow()

    // Synchrone : sinon le canvas redimensionné resterait vide ou étiré une frame.
    resizeObserver = new ResizeObserver(drawNow)
    if (containerRef.value) {
      resizeObserver.observe(containerRef.value)
    }
  })

  onUnmounted(() => {
    resizeObserver?.disconnect()
    if (frame !== null) {
      cancelAnimationFrame(frame)
      frame = null
    }
  })

  watch([active, radiusX, radiusY, haloPositions, seed, theme], scheduleDraw)

  // Redraw forcé, à appeler après un remplacement de `game` qui ne modifie
  // aucune des valeurs observées ci-dessus (ex: reprise d'une partie mise en
  // arrière-plan puis restaurée à l'identique) — le watch ci-dessus ne se
  // redéclencherait sinon jamais, laissant le canvas figé sur l'état d'avant
  // la restauration jusqu'au prochain changement réel (mine, cœur...).
  // Reste synchrone : App.vue l'appelle juste après le remplacement de game.
  return { redraw: drawNow }
}
