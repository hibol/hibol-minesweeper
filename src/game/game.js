const directions = [
    [-1, -1],
    [0, -1],
    [1, -1],
    [-1, 0],
    [1, 0],
    [-1, 1],
    [0, 1],
    [1, 1]
]

function cellKey(x, y) {
    return `${x},${y}`
}

// Le mode "treasure" (chasse au trésor, roadmap point 10) réutilise tout le
// moteur infini : cases matérialisées à la volée, densité fonction de la
// distance à l'origine, interdiction de révéler une case isolée, repère de
// distance max. Seuls le brouillard (getDarkness) et le bouton "give up"
// (canGiveUp) lui sont retirés — ces deux-là restent volontairement gardés
// sur game.mode === "infinite" strict, plus bas.
function isInfiniteLike(game) {
    return game.mode === "infinite" || game.mode === "treasure"
}

function hash(seed, x, y) {
    let h = (seed ^ (x * 374761393) ^ (y * 668265263)) | 0
    h = Math.imul(h ^ (h >>> 13), 1274126177)
    h = h ^ (h >>> 16)
    return (h >>> 0) / 4294967296  // normalise en [0, 1)
}

export function isMineAt(seed, x, y, density) {
    return hash(seed, x, y) < density
}

export function createGrid(width, height) {
    const cells = new Map()
    
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            cells.set(cellKey(x, y), {
                x,
                y,
                isMine: false,
                revealed: false,
                flagged: false,
                wrong: false,
                detonated: false,
                neighborMines: 0,
                tiltDeg: 0
            })
        }
    }
    
    return cells
}

export function placeMines(cells, numberOfMines) {
    const cellList = [...cells.values()]
    let minesPlaced = 0
    
    while (minesPlaced < numberOfMines) {
        const randomIndex = Math.floor(Math.random() * cellList.length)
        const cell = cellList[randomIndex]
        
        if (!cell.isMine) {
            cell.isMine = true
            minesPlaced++
        }
    }
}

export function getCell(game, x, y) {
  const key = cellKey(x, y)

  if (!game.cells.has(key) && isInfiniteLike(game)) {
    game.cells.set(key, createInfiniteCell(game, x, y))
  }

  // Toujours relire via .get() : une Map réactive Vue n'enveloppe une valeur
  // en proxy réactif qu'à la lecture, pas au stockage — retourner la variable
  // locale renverrait un objet brut, invisible pour le système de réactivité.
  return game.cells.get(key)
}

function isInSafeZone(game, x, y) {
  if (!game.safeZone) {
    return false
  }

  return Math.abs(x - game.safeZone.x) <= 1 && Math.abs(y - game.safeZone.y) <= 1
}

const MAX_DENSITY = 0.25
// Distance (en cases) à laquelle la densité a comblé l'essentiel de l'écart
// entre la densité de base et MAX_DENSITY. Valeur à ajuster en jouant.
// Exposée en tant que game.densityScale (cf. createInfiniteGame) plutôt que
// figée en constante : le mode 3 (roadmap point 10) s'en sert pour ramper
// bien plus vite vers MAX_DENSITY à baseDensity égale.
export const DEFAULT_DENSITY_SCALE = 60

// Pour que deux zones à la même distance de l'origine n'aient pas exactement
// la même densité (des anneaux parfaitement concentriques seraient visibles),
// on ajoute un bruit par bloc de cases plutôt que par case individuelle (un
// bruit par case donnerait juste un flicker aléatoire, pas une "poche"
// perceptible en jouant). Chaque coin de bloc a une valeur stable (bruit de
// valeur classique), et on interpole entre les 4 coins qui entourent (x, y) :
// sans ça, la densité sauterait brutalement à chaque frontière de bloc au
// lieu de monter/descendre progressivement en traversant une poche.
const DENSITY_CHUNK_SIZE = 24
// Amplitude à ajuster en jouant : avec l'interpolation, une valeur plus
// élevée qu'un simple bruit par bloc reste lisible (pas de cassure nette).
const DENSITY_JITTER = 0.045

function smoothstep(t) {
  return t * t * (3 - 2 * t)
}

// Bruit stable pour le coin de bloc (chunkX, chunkY), dans [-1, 1].
function chunkNoise(game, chunkX, chunkY) {
  return hash(game.seed + 1, chunkX, chunkY) * 2 - 1
}

function densityJitter(game, x, y) {
  const gx = x / DENSITY_CHUNK_SIZE
  const gy = y / DENSITY_CHUNK_SIZE
  const chunkX = Math.floor(gx)
  const chunkY = Math.floor(gy)
  const tx = smoothstep(gx - chunkX)
  const ty = smoothstep(gy - chunkY)

  const topLeft = chunkNoise(game, chunkX, chunkY)
  const topRight = chunkNoise(game, chunkX + 1, chunkY)
  const bottomLeft = chunkNoise(game, chunkX, chunkY + 1)
  const bottomRight = chunkNoise(game, chunkX + 1, chunkY + 1)

  const top = topLeft + (topRight - topLeft) * tx
  const bottom = bottomLeft + (bottomRight - bottomLeft) * tx
  const noise = top + (bottom - top) * ty

  return noise * DENSITY_JITTER
}

// Zones quasi infranchissables (roadmap point 5) : de rares poches où la
// densité de mines grimpe bien au-dessus de MAX_DENSITY, à contourner plutôt
// qu'à traverser. Placement déterministe (hash de seed), par "super-cases" de
// HOTSPOT_CELL_SIZE : chacune a HOTSPOT_CHANCE de contenir une zone, centrée à
// une position jitterée, de rayon variable. Constantes de module (pas de
// champs de game) — pas encore de besoin de tuning par partie, cf. autoplay.
const HOTSPOT_CELL_SIZE = 110
const HOTSPOT_CHANCE = 0.5
const HOTSPOT_MIN_RADIUS = 8
const HOTSPOT_MAX_RADIUS = 11
// Ajouté à la densité ambiante au cœur d'une zone (≈ 0.25 ambiant + 0.35 ≈ 0.6
// de mines : plus aucune déduction de chemin sûr possible).
const HOTSPOT_STRENGTH = 0.35
// Fraction du rayon en plateau plein avant la retombée douce vers le bord.
const HOTSPOT_CORE = 0.5
// Aucune zone à moins de ça de l'origine (garde l'ouverture de départ intacte).
const HOTSPOT_MIN_DISTANCE = 45
// La danger bar réagit (palpite) jusqu'à ce multiple du rayon — un préavis
// avant d'être au pied du mur. Cf. getHotspotProximity.
const HOTSPOT_PROX_MARGIN = 1.8

// La zone de la super-case (hcx, hcy), ou null s'il n'y en a pas / si elle
// tombe trop près de l'origine.
function hotspotInCell(game, hcx, hcy) {
  if (hash(game.seed + 4, hcx, hcy) >= HOTSPOT_CHANCE) {
    return null
  }

  const cx = (hcx + hash(game.seed + 5, hcx, hcy)) * HOTSPOT_CELL_SIZE
  const cy = (hcy + hash(game.seed + 6, hcx, hcy)) * HOTSPOT_CELL_SIZE

  if (Math.hypot(cx, cy) < HOTSPOT_MIN_DISTANCE) {
    return null
  }

  const radius = HOTSPOT_MIN_RADIUS + hash(game.seed + 7, hcx, hcy) * (HOTSPOT_MAX_RADIUS - HOTSPOT_MIN_RADIUS)

  return { cx, cy, radius }
}

// Distance normalisée (distance / rayon) à la zone la plus proche parmi les 9
// super-cases autour de (x, y), avec son rayon — ou null si aucune n'est même
// vaguement à portée. { ratio, radius }.
function nearestHotspot(game, x, y) {
  const baseCx = Math.floor(x / HOTSPOT_CELL_SIZE)
  const baseCy = Math.floor(y / HOTSPOT_CELL_SIZE)
  let best = null

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const spot = hotspotInCell(game, baseCx + dx, baseCy + dy)

      if (!spot) {
        continue
      }

      const ratio = Math.hypot(x - spot.cx, y - spot.cy) / spot.radius

      if (best === null || ratio < best.ratio) {
        best = { ratio, radius: spot.radius }
      }
    }
  }

  return best
}

// Surcroît de densité dû à une zone quasi infranchissable en (x, y) : plateau
// plein au cœur, retombée douce jusqu'à 0 au bord.
function hotspotBoost(game, x, y) {
  const near = nearestHotspot(game, x, y)

  if (!near || near.ratio >= 1) {
    return 0
  }

  const t = Math.max(0, (near.ratio - HOTSPOT_CORE) / (1 - HOTSPOT_CORE))

  return HOTSPOT_STRENGTH * (1 - smoothstep(t))
}

function densityAt(game, x, y) {
  const distance = Math.hypot(x, y)
  const ramped = MAX_DENSITY - (MAX_DENSITY - game.baseDensity) * Math.exp(-distance / game.densityScale)
  const ambient = Math.min(MAX_DENSITY, ramped + densityJitter(game, x, y))

  return Math.min(0.95, ambient + hotspotBoost(game, x, y))
}

// Fraction de la marge base -> plafond déjà parcourue à (x, y) : 0 au centre
// (à la densité de base), 1 une fois MAX_DENSITY atteinte. Sert de jauge
// "danger" pour l'UI, indépendante du hash de placement des mines.
export function getDangerLevel(game, x, y) {
  if (!isInfiniteLike(game)) {
    return 0
  }

  const density = densityAt(game, x, y)
  const level = (density - game.baseDensity) / (MAX_DENSITY - game.baseDensity)

  return Math.max(0, Math.min(1, level))
}

// Densité réelle (probabilité de mine) à une position donnée, exposée pour
// des consommateurs externes au moteur (ex. un solveur qui a besoin d'une
// vraie magnitude de risque, pas juste du niveau relatif de getDangerLevel).
export function getMineDensity(game, x, y) {
  if (!isInfiniteLike(game)) {
    return 0
  }

  return densityAt(game, x, y)
}

// Outillage (mesure via scripts/autoplay.js) : identifie la zone quasi
// infranchissable qui influence (x, y) — { key, ratio }, `key` stable par zone
// (coordonnées de sa super-case) pour dédupliquer — ou null si aucune à portée.
export function hotspotDebugAt(game, x, y) {
  const baseCx = Math.floor(x / HOTSPOT_CELL_SIZE)
  const baseCy = Math.floor(y / HOTSPOT_CELL_SIZE)
  let best = null

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const hcx = baseCx + dx
      const hcy = baseCy + dy
      const spot = hotspotInCell(game, hcx, hcy)

      if (!spot) {
        continue
      }

      const ratio = Math.hypot(x - spot.cx, y - spot.cy) / spot.radius

      if (best === null || ratio < best.ratio) {
        best = { key: `${hcx},${hcy}`, ratio }
      }
    }
  }

  return best
}

// Proximité (0..1) de la zone quasi infranchissable la plus proche : 1 en
// plein cœur, retombée douce jusqu'à 0 à HOTSPOT_PROX_MARGIN fois le rayon.
// Pilote la palpitation du remplissage de la danger bar (App.vue) — un préavis
// pour contourner la zone avant d'être dedans.
export function getHotspotProximity(game, x, y) {
  if (!isInfiniteLike(game)) {
    return 0
  }

  const near = nearestHotspot(game, x, y)

  if (!near || near.ratio >= HOTSPOT_PROX_MARGIN) {
    return 0
  }

  return 1 - smoothstep(near.ratio / HOTSPOT_PROX_MARGIN)
}

// --- Chasse au trésor (roadmap point 10) -----------------------------------

// Fourchette de distance (euclidienne) du coffre à l'origine.
export const CHEST_MIN_DISTANCE = 50
export const CHEST_MAX_DISTANCE = 100
// Run continu à 3 vies (révisé 2026-09-03 : on garde la progression quand une
// mine saute, la 3e mine met fin à la journée — plus de "retour à zéro"). Hors
// mode DEV (game.unlimitedLives), la journée est perdue dès que
// minesTriggeredCount atteint ce seuil.
export const TREASURE_MAX_MINES = 3
// Rampe de densité volontairement plus douce que l'infini normal
// (DEFAULT_DENSITY_SCALE = 60) : il faut pouvoir router jusqu'à distance
// 50-100 en ne touchant pas plus de 2 mines. Valeurs de départ, à caler via
// scripts/autoplay.js.
export const TREASURE_DENSITY_SCALE = 130
export const TREASURE_BASE_DENSITY = 0.1

// Position du coffre pour le k-ième placement de la tentative : k = 0 est la
// position "du jour", k >= 1 les relocalisations successives après chaque
// tornade révélée. Déterministe à partir de la seed seule — donc reconstituable
// après un reload à partir du seul compteur game.tornadoCount, sans le stocker.
// Flux de hash +9 (mines = seed, +1 jitter, +2 cœurs, +3 robots, +4..+7
// hotspots, +8 tornades) : l'angle et la distance tirés sur deux "lignes" (y =
// 0 / y = 1) du même flux.
export function chestPositionFor(seed, k) {
  const angle = hash(seed + 9, k, 0) * Math.PI * 2
  const distance =
    CHEST_MIN_DISTANCE + hash(seed + 9, k, 1) * (CHEST_MAX_DISTANCE - CHEST_MIN_DISTANCE)

  return {
    x: Math.round(Math.cos(angle) * distance),
    y: Math.round(Math.sin(angle) * distance)
  }
}

// Zone 3x3 forcée non-minée autour du coffre — sa propre case ET ses 8
// voisines (décision 2026-09-03 : l'approche finale ne doit pas être un pile
// ou face). Couvre toutes les positions vues depuis le début de la tentative
// (k de 0 à game.tornadoCount) : une case déjà matérialisée près d'une
// ancienne position garde son isMine d'alors, mais toute case générée après
// une relocalisation est forcée sûre autour de la nouvelle position.
function isInChestSafeZone(game, x, y) {
  if (game.mode !== "treasure") {
    return false
  }

  for (let k = 0; k <= game.tornadoCount; k++) {
    const chest = chestPositionFor(game.seed, k)

    if (Math.abs(x - chest.x) <= 1 && Math.abs(y - chest.y) <= 1) {
      return true
    }
  }

  return false
}

function isMineForGame(game, x, y) {
  if (isInSafeZone(game, x, y) || isInChestSafeZone(game, x, y)) {
    return false
  }

  return isMineAt(game.seed, x, y, densityAt(game, x, y))
}

// Flux de hash +8 (cf. chestPositionFor pour la liste des flux) : placement des
// tornades. Volontairement plus rares que les robots (ROBOT_DENSITY_MIN/MAX).
function isTornadoAt(seed, x, y, density) {
  return hash(seed + 8, x, y) < density
}

const TORNADO_DENSITY_MIN = 0.0004
const TORNADO_DENSITY_MAX = 0.002
// Aucune tornade dans ce rayon (cases) autour de la position DU JOUR du coffre
// (jamais la position courante : cell.isTornado est figé à la création de la
// case, il ne peut pas dépendre d'un coffre qui bouge). Évite les boucles
// infernales sur l'approche finale. Tunable.
const TORNADO_CHEST_EXCLUSION = 8

function tornadoDensityAt(game, x, y) {
  return (
    TORNADO_DENSITY_MIN +
    (TORNADO_DENSITY_MAX - TORNADO_DENSITY_MIN) * getDangerLevel(game, x, y)
  )
}

function isTornadoForGame(game, x, y) {
  if (game.mode !== "treasure" || game.openingInProgress || isMineForGame(game, x, y)) {
    return false
  }

  const home = chestPositionFor(game.seed, 0)

  if (Math.hypot(x - home.x, y - home.y) <= TORNADO_CHEST_EXCLUSION) {
    return false
  }

  return isTornadoAt(game.seed, x, y, tornadoDensityAt(game, x, y))
}

// Flux de hash séparé (+2 : +1 déjà pris par densityJitter) pour que le
// placement des cœurs ne corrèle pas artificiellement avec celui des mines.
function isHeartAt(seed, x, y, density) {
  return hash(seed + 2, x, y) < density
}

// Plus de cœurs là où le danger (cf. getDangerLevel) est déjà élevé : un
// coup de pouce qui lisse la courbe de difficulté plutôt qu'un aplat
// uniforme — sans neutraliser la pression, d'où un écart modéré entre min
// et max (~×3) plutôt qu'un gros multiplicateur. Valeurs à ajuster en
// jouant, comme le reste des constantes de densité de ce fichier.
const HEART_DENSITY_MIN = 0.003
const HEART_DENSITY_MAX = 0.01

// game.heartDensityScale (par défaut 1, cf. createInfiniteGame) permet de
// désactiver ou doser les cœurs sans toucher au reste de la mécanique —
// utile pour comparer une même seed avec/sans cœurs (scripts/autoplay.js).
function heartDensityAt(game, x, y) {
  return (
    (HEART_DENSITY_MIN + (HEART_DENSITY_MAX - HEART_DENSITY_MIN) * getDangerLevel(game, x, y)) *
    game.heartDensityScale
  )
}

// game.openingInProgress exclut toute la zone ouverte automatiquement au
// lancement d'une partie (cf. createInfiniteGame) — pas juste la safe zone
// 3x3 des mines : la forme exacte de cette zone dépend du flood-fill des
// cases à 0 voisin, impossible à connaître à l'avance, donc plus simple et
// plus sûr de désactiver les cœurs pendant toute la construction plutôt que
// d'essayer de deviner une zone d'exclusion fixe.
// game.heartMinDensity (cf. createInfiniteGame) : coupure dure sous laquelle
// aucun cœur ne peut apparaître, quelle que soit heartDensityAt —
// contrairement à heartDensityScale (qui ne fait que doser), sert à garder
// les cœurs hors des zones peu dangereuses plutôt que juste plus rares
// partout. 0.23 choisi via scripts/autoplay.js (--heartMinDensity=X) : sous
// 0.2 quasi aucun effet sur le taux de plafonnement de l'assombrissement
// (0 à 5.5%), au-dessus de 0.23 les cœurs deviennent si rares qu'ils
// n'apparaissent presque jamais (médiane 0, moyenne <2/partie, ~77% des
// parties plafonnent quand même) — le "coup de chance rare" recherché.
function isHeartForGame(game, x, y) {
  return (
    !game.openingInProgress &&
    !isMineForGame(game, x, y) &&
    getMineDensity(game, x, y) >= game.heartMinDensity &&
    isHeartAt(game.seed, x, y, heartDensityAt(game, x, y))
  )
}

// Flux de hash séparé (+3 : +1 jitter, +2 cœurs) pour ne pas corréler le
// placement des robots avec mines/cœurs.
function isRobotAt(seed, x, y, density) {
  return hash(seed + 3, x, y) < density
}

// Plus rares que les cœurs (HEART_DENSITY_MIN/MAX ci-dessus) et concentrés
// aux zones déjà dangereuses par la même mise à l'échelle sur getDangerLevel.
// Valeurs à ajuster en jouant, comme le reste des constantes de densité de ce
// fichier.
const ROBOT_DENSITY_MIN = 0.001
const ROBOT_DENSITY_MAX = 0.006

// game.robotDensityScale (par défaut 1, cf. createInfiniteGame) : même
// intérêt que heartDensityScale, comparer une même seed avec/sans robots via
// scripts/autoplay.js.
function robotDensityAt(game, x, y) {
  return (
    (ROBOT_DENSITY_MIN + (ROBOT_DENSITY_MAX - ROBOT_DENSITY_MIN) * getDangerLevel(game, x, y)) *
    game.robotDensityScale
  )
}

// game.robotMinDensity (cf. createInfiniteGame) : même mécanisme de coupure
// dure que game.heartMinDensity, mais son propre champ — les robots sont
// déjà bien plus rares que les cœurs (ROBOT_DENSITY_MIN/MAX ci-dessus), pas
// de raison de supposer que le même seuil de danger local soit le bon sans
// re-tuner séparément via scripts/autoplay.js (--robotMinDensity=X). Reprend
// pour l'instant le même défaut (0.23) que heartMinDensity, faute de
// données de tuning propres aux robots.
function isRobotForGame(game, x, y) {
  return (
    !game.openingInProgress &&
    !isMineForGame(game, x, y) &&
    !isHeartForGame(game, x, y) &&
    getMineDensity(game, x, y) >= game.robotMinDensity &&
    isRobotAt(game.seed, x, y, robotDensityAt(game, x, y))
  )
}

function countMinesAround(game, x, y) {
  let count = 0

  for (const [dx, dy] of directions) {
    if (isMineForGame(game, x + dx, y + dy)) {
      count++
    }
  }

  return count
}

// Exporté : reconstruit le triplet isMine/isHeart/neighborMines pour une
// case donnée à partir des seuls paramètres déterministes du game (seed,
// densités) — c'est exactement ce dont a besoin gameStorage.js pour
// restaurer une case sans avoir à sauvegarder ces champs, qui ne dépendent
// jamais de l'historique de la partie.
export function createInfiniteCell(game, x, y) {
  const isMine = isMineForGame(game, x, y)

  return {
    x,
    y,
    isMine,
    isHeart: !isMine && isHeartForGame(game, x, y),
    isRobot: !isMine && isRobotForGame(game, x, y),
    // Chasse au trésor (roadmap point 10). isTornado est figé ici pour
    // toujours (comme isHeart/isRobot) ; isChest, lui, n'existe pas à la
    // création — il est posé dynamiquement dans openCell quand la case
    // coïncide avec la position courante du coffre, qui peut avoir bougé.
    isTornado: !isMine && isTornadoForGame(game, x, y),
    revealed: false,
    flagged: false,
    wrong: false,
    neighborMines: countMinesAround(game, x, y),
    tiltDeg: 0,
    // Champs transitoires, jamais persistés (cf. gameStorage.js) : purs
    // artifices de présentation pilotés par App.vue pour l'animation de la
    // marche du robot (cf. performRobotWalk). pendingReveal masque une case
    // déjà révélée dans le modèle jusqu'à son tour ; robotHere positionne le
    // sprite du robot sur la case qu'il "occupe" à l'instant t (contrairement
    // à isRobot, qui reste vrai pour toujours sur la case d'origine — c'est
    // robotHere qui pilote l'icône affichée, et elle se déplace).
    pendingReveal: false,
    robotHere: false
  }
}


export function getNeighbors(game, cell) {
    const neighbors = []
    
    for (const [dx, dy] of directions) {
        const neighbor = getCell(
            game,
            cell.x + dx,
            cell.y + dy
        )
        
        if (neighbor) {
            neighbors.push(neighbor)
        }
    }
    
    return neighbors
}

export function countNeighborMines(game) {
    for (const cell of game.cells.values()) {
        let count = 0
        
        for (const [dx, dy] of directions) {
            const neighbor = getCell(
                game,
                cell.x + dx,
                cell.y + dy
            )
            
            if (neighbor?.isMine) {
                count++
            }
        }
        
        cell.neighborMines = count
    }
}

export function createGame(width, height, mineCount) {
    const game = {
        mode: "classic",
        width,
        height,
        mineCount,
        status: "playing",
        firstMove: true,
        cells: createGrid(width, height),
        revealedCount: 0,
        flaggedCount: 0,
        minesTriggeredCount: 0,
        // Contrairement à flaggedCount (peut retomber à 0 après pose+retrait),
        // ne redevient jamais false une fois vrai — sert l'achievement "Ultra
        // Pro" (gagner sans jamais avoir posé de drapeau, roadmap point 8).
        everFlagged: false
    }
    
    placeMines(game.cells, mineCount)
    countNeighborMines(game)

    return game
}

// Contrairement à l'infini, une partie classic n'a rien de déterministe à
// recalculer (les mines viennent de placeMines, pas d'un hash de seed) —
// le snapshot doit donc contenir l'état complet de chaque case. Le plateau
// restant petit (10x10), le coût est négligeable.
export function restoreClassicGame(snapshot) {
    const game = {
        mode: "classic",
        width: snapshot.width,
        height: snapshot.height,
        mineCount: snapshot.mineCount,
        status: snapshot.status,
        firstMove: snapshot.firstMove,
        cells: new Map(),
        revealedCount: snapshot.revealedCount,
        flaggedCount: snapshot.flaggedCount,
        minesTriggeredCount: snapshot.minesTriggeredCount,
        // ?? false : snapshots antérieurs à ce champ (avant le roadmap point
        // 8) n'en ont pas — traiter comme "jamais flaggé" plutôt que planter,
        // seule conséquence une Ultra Pro qui pourrait se débloquer à tort
        // sur une partie très ancienne reprise après un reload, cas limite
        // acceptable plutôt qu'une migration de snapshot.
        everFlagged: snapshot.everFlagged ?? false
    }

    for (const cell of snapshot.cells) {
        game.cells.set(cellKey(cell.x, cell.y), { ...cell })
    }

    return game
}

export const MAX_OPENING_REVEAL = 60

export function createInfiniteGame(
  seed,
  baseDensity = 0.15,
  heartDensityScale = 1,
  heartMinDensity = 0.23,
  densityScale = DEFAULT_DENSITY_SCALE,
  darknessMineThreshold = DEFAULT_DARKNESS_MINE_THRESHOLD,
  robotDensityScale = 1,
  robotMinDensity = 0.23
) {
  let game

  do {
    game = {
      mode: "infinite",
      seed,
      baseDensity,
      heartDensityScale,
      heartMinDensity,
      densityScale,
      darknessMineThreshold,
      robotDensityScale,
      robotMinDensity,
      status: "playing",
      firstMove: false,
      cells: new Map(),
      safeZone: { x: 0, y: 0 },
      revealedCount: 0,
      flaggedCount: 0,
      minesTriggeredCount: 0,
      heartsCollectedCount: 0,
      robotsTriggeredCount: 0,
      // Transitoires, jamais persistés (cf. gameStorage.js) : purement des
      // signaux d'un tick de jeu à l'autre pour la couche Vue (cf. App.vue).
      pendingRobotTrails: [],
      robotWalkInProgress: false,
      maxDistance: 0,
      openingInProgress: true
    }

    openCell(game, getCell(game, 0, 0))
    game.openingInProgress = false
    seed++
  } while (game.revealedCount > MAX_OPENING_REVEAL)

  return game
}

// Ne restaure que les cases "touchées" (cf. snapshot.cells dans
// gameStorage.js) — isMine/isHeart/neighborMines sont recalculés via
// createInfiniteCell plutôt que sauvegardés : ils ne dépendent que de
// seed/densités, déjà dans le snapshot, jamais de l'historique de la
// partie. Bien moins volumineux qu'un snapshot classic complet vu que la
// grande majorité des cases générées en infini ne sont jamais révélées.
export function restoreInfiniteGame(snapshot) {
  const game = {
    mode: "infinite",
    seed: snapshot.seed,
    baseDensity: snapshot.baseDensity,
    heartDensityScale: snapshot.heartDensityScale,
    heartMinDensity: snapshot.heartMinDensity,
    // Anciennes parties sauvegardées avant l'ajout du mode 3 (roadmap point
    // 10) / des robots (roadmap point 6) n'ont pas ces champs dans leur
    // snapshot.
    densityScale: snapshot.densityScale ?? DEFAULT_DENSITY_SCALE,
    darknessMineThreshold: snapshot.darknessMineThreshold ?? DEFAULT_DARKNESS_MINE_THRESHOLD,
    robotDensityScale: snapshot.robotDensityScale ?? 1,
    robotMinDensity: snapshot.robotMinDensity ?? 0.23,
    status: snapshot.status,
    firstMove: false,
    cells: new Map(),
    safeZone: { x: 0, y: 0 },
    revealedCount: snapshot.revealedCount,
    flaggedCount: snapshot.flaggedCount,
    minesTriggeredCount: snapshot.minesTriggeredCount,
    heartsCollectedCount: snapshot.heartsCollectedCount,
    robotsTriggeredCount: snapshot.robotsTriggeredCount ?? 0,
    pendingRobotTrails: [],
    robotWalkInProgress: false,
    maxDistance: snapshot.maxDistance,
    openingInProgress: false
  }

  for (const touched of snapshot.cells) {
    const cell = createInfiniteCell(game, touched.x, touched.y)
    cell.revealed = touched.revealed
    cell.flagged = touched.flagged
    cell.wrong = touched.wrong
    cell.tiltDeg = touched.tiltDeg
    game.cells.set(cellKey(touched.x, touched.y), cell)
  }

  return game
}

// --- Chasse au trésor (roadmap point 10) ---------------------------------

// Champs constants d'une partie chasse au trésor, partagés entre création et
// restauration : cœurs/robots désactivés (scale 0 court-circuite
// isHeartForGame/isRobotForGame sans les modifier), rampe de densité douce.
function treasureGameParams(seed, unlimitedLives) {
  return {
    mode: "treasure",
    seed,
    baseDensity: TREASURE_BASE_DENSITY,
    densityScale: TREASURE_DENSITY_SCALE,
    heartDensityScale: 0,
    heartMinDensity: 1,
    robotDensityScale: 0,
    robotMinDensity: 1,
    // Jamais de brouillard ici (getDarkness reste gardé sur "infinite"), mais
    // le champ doit exister pour les rares lecteurs qui le touchent.
    darknessMineThreshold: DEFAULT_DARKNESS_MINE_THRESHOLD,
    firstMove: false,
    safeZone: { x: 0, y: 0 },
    // Mode DEV : les mines ne tuent jamais (on explore librement pour le
    // tuning). En jeu réel, false → la 3e mine met fin à la journée.
    unlimitedLives: !!unlimitedLives,
    heartsCollectedCount: 0,
    robotsTriggeredCount: 0,
    pendingRobotTrails: [],
    robotWalkInProgress: false
  }
}

// Ouvre la poche de départ à (0,0). openingInProgress bloque les tornades
// pendant la construction, comme les cœurs/robots en infini.
function openTreasureStart(game) {
  game.openingInProgress = true
  openCell(game, getCell(game, 0, 0))
  game.openingInProgress = false
}

export function createTreasureGame(seed, { unlimitedLives = false } = {}) {
  let game

  // Même garde-fou que createInfiniteGame : si l'ouverture auto à (0,0)
  // dépasse MAX_OPENING_REVEAL, on décale la seed effective et on recommence.
  // Déterministe pour une entrée donnée — la "seed du jour" reste partagée.
  do {
    game = {
      ...treasureGameParams(seed, unlimitedLives),
      status: "playing", // "playing" | "won" | "lost" pour toute la journée
      cells: new Map(),
      tornadoCount: 0,
      chest: chestPositionFor(seed, 0),
      chestFound: false,
      pendingTornado: false,
      revealedCount: 0,
      flaggedCount: 0,
      minesTriggeredCount: 0,
      maxDistance: 0,
      openingInProgress: true
    }

    openTreasureStart(game)
    seed += 1
  } while (game.revealedCount > MAX_OPENING_REVEAL)

  return game
}

// Restaure une partie chasse au trésor en cours (reload / retour d'arrière-
// plan). Même principe que restoreInfiniteGame : seules les cases "touchées"
// sont dans le snapshot, isMine/isTornado/neighborMines sont recalculés via
// createInfiniteCell (déterministes depuis seed + tornadoCount).
export function restoreTreasureGame(snapshot) {
  const game = {
    ...treasureGameParams(snapshot.seed, snapshot.unlimitedLives),
    status: snapshot.status,
    cells: new Map(),
    tornadoCount: snapshot.tornadoCount ?? 0,
    chest: chestPositionFor(snapshot.seed, snapshot.tornadoCount ?? 0),
    chestFound: snapshot.chestFound ?? false,
    pendingTornado: false,
    revealedCount: snapshot.revealedCount ?? 0,
    flaggedCount: snapshot.flaggedCount ?? 0,
    minesTriggeredCount: snapshot.minesTriggeredCount ?? 0,
    maxDistance: snapshot.maxDistance ?? 0,
    openingInProgress: false
  }

  for (const touched of snapshot.cells ?? []) {
    const cell = createInfiniteCell(game, touched.x, touched.y)
    cell.revealed = touched.revealed
    cell.flagged = touched.flagged

    if (game.chestFound && touched.x === game.chest.x && touched.y === game.chest.y) {
      cell.isChest = true
    }

    game.cells.set(cellKey(touched.x, touched.y), cell)
  }

  return game
}

function hasRevealedNeighbor(game, cell) {
    return getNeighbors(game, cell).some(neighbor => neighbor.revealed)
}

// Une case a-t-elle encore un voisin sur lequel un robot pourrait avancer
// (non révélé, non flaggé) — cf. performRobotWalk.
function hasUnrevealedNeighbor(game, cell) {
    return getNeighbors(game, cell).some(neighbor => !neighbor.revealed && !neighbor.flagged)
}

// Exposée séparément de revealCell (plutôt qu'un simple early-return interne)
// pour qu'App.vue puisse distinguer ce refus précis d'un no-op silencieux
// ordinaire (case flaggée, partie finie) et afficher un message dédié — cf.
// performReveal dans App.vue. En classic, toujours faux : le plateau est
// petit et deviner une zone séparée sans indice fait partie du jeu normal,
// contrairement à l'infini où permettre de "téléporter" un reveal loin de
// la zone explorée rendrait maxDistance/le danger-meter absurdes (roadmap
// point 11) — un joueur pourrait grappiller de la distance sans jamais
// traverser le danger entre les deux.
export function isTooFarToReveal(game, cell) {
    return isInfiniteLike(game) && !cell.revealed && !hasRevealedNeighbor(game, cell)
}

export function revealCell(game, cell) {
    if (game.status !== "playing") {
        return
    }

    if (cell.flagged) {
        return
    }

    if (cell.revealed) {
        // Une mine explosée (mode infini, cf. openCell) reste revealed mais
        // n'a pas de neighborMines exploitable — rien à déduire dessus,
        // chorder ne doit rien faire.
        if (!cell.isMine) {
            revealAround(game, cell)
        }
        return
    }

    if (game.firstMove) {
        game.firstMove = false
        ensureSafeZone(game, cell)
    }

    if (isTooFarToReveal(game, cell)) {
        return
    }

    openCell(game, cell)
}

// Magnitude min/max (en degrés) du tilt : on exclut la zone proche de 0,
// sinon certaines cases héritent d'une rotation trop faible pour se voir.
const MIN_TILT_DEG = 5
const MAX_TILT_DEG = 15

// Rotation aléatoire (cosmétique, pas besoin d'être reproductible) donnée à
// tous les voisins non-mine d'une mine qui explose (révélés ou non), comme si
// le souffle les avait tous bousculés — les autres mines voisines ne
// tiltent pas. Ne touche jamais une case déjà tiltée (premier impact gagne).
function jostleNeighbors(game, cell) {
    const neighbors = getNeighbors(game, cell)

    for (const neighbor of neighbors) {
        if (!neighbor.isMine && neighbor.tiltDeg === 0) {
            const magnitude = MIN_TILT_DEG + Math.random() * (MAX_TILT_DEG - MIN_TILT_DEG)
            const sign = Math.random() < 0.5 ? -1 : 1
            neighbor.tiltDeg = sign * magnitude
        }
    }
}

function openCell(game, cell) {
    cell.revealed = true

    if (isInfiniteLike(game)) {
        game.maxDistance = Math.max(game.maxDistance, Math.hypot(cell.x, cell.y))
    }

    if (cell.isMine) {
        game.minesTriggeredCount++
        jostleNeighbors(game, cell)
        markWrong(game, cell)

        if (game.mode === "classic") {
            // Distingue LA mine cliquée des autres, révélées juste après par
            // revealAllMines sans ce flag (cf. MineCell.vue, .cell.detonated).
            cell.detonated = true
            game.status = "lost"
            revealAllMines(game)
        } else if (game.mode === "treasure") {
            // On garde la progression (révisé 2026-09-03) : la mine reste
            // révélée, on continue. La 3e mine (TREASURE_MAX_MINES) met fin à
            // la journée — sauf en mode DEV (unlimitedLives). minesTriggeredCount
            // a déjà été incrémenté juste au-dessus.
            if (!game.unlimitedLives && game.minesTriggeredCount >= TREASURE_MAX_MINES) {
                game.status = "lost"
            }
        }
        return
    }

    game.revealedCount++

    if (cell.isHeart) {
        game.heartsCollectedCount++
    }

    if (game.mode === "treasure" && game.status === "playing") {
        // Coffre : atteint par un clic direct OU balayé par une cascade de
        // cases à 0 voisin — les deux passent par ici (décision 2026-09-03 :
        // "cascade = victoire").
        if (!game.chestFound && cell.x === game.chest.x && cell.y === game.chest.y) {
            game.chestFound = true
            cell.isChest = true
            game.status = "won"
        } else if (cell.isTornado) {
            // Relocalise le coffre. game.tornadoCount pilote à la fois la
            // nouvelle position (chestPositionFor) et la zone forcée
            // non-minée autour d'elle (isInChestSafeZone). pendingTornado est
            // un signal one-shot lu et remis à false par App.vue (secousse +
            // pivot de la boussole).
            game.tornadoCount++
            game.chest = chestPositionFor(game.seed, game.tornadoCount)
            game.pendingTornado = true
        }
    }

    // robotWalkInProgress évite qu'un robot révélé PAR la marche d'un autre
    // robot (un pas de la marche, ou une cascade qu'il déclenche) ne relance
    // sa propre marche en chaîne — un robot révélé par un clic joueur ou une
    // cascade indépendante déclenche bien la sienne normalement.
    if (cell.isRobot && !game.robotWalkInProgress) {
        game.robotsTriggeredCount++
        game.pendingRobotTrails.push({ origin: cell, steps: performRobotWalk(game, cell) })
    }

    if (cell.neighborMines === 0) {
        revealNeighbors(game, cell)
    }

    if (game.mode === "classic") {
        checkVictory(game)
    }
}

// Nombre max de cases explorées par une marche de robot (roadmap point 6).
const ROBOT_MAX_STEPS = 10

// Pendant le premier tiers du trajet (arrondi au supérieur), le robot évite
// les mines parmi ses candidates s'il a le choix — laisser une marche
// s'arrêter dès le 1er ou 2e pas serait frustrant juste après avoir trouvé
// le robot. Au-delà, il redevient exposé normalement (sinon la marche ne
// prend jamais fin sur une mine tant qu'il reste une case sûre autour).
const ROBOT_SAFE_STEPS = Math.ceil(ROBOT_MAX_STEPS / 3)

function revealedCellSet(game) {
    const set = new Set()

    for (const cell of game.cells.values()) {
        if (cell.revealed) {
            set.add(cell)
        }
    }

    return set
}

// Marche aléatoire du robot case par case, résolue d'un coup (comme la
// cascade des cases à 0 voisin ci-dessus) plutôt qu'étalée dans le temps :
// game.js reste synchrone/déterministe, donc compatible tel quel avec
// scripts/autoplay.js et la sauvegarde mi-partie (aucun état "marche en
// cours" n'existe jamais dans le modèle). Renvoie le trajet par pas :
// [{ lead, opened }] où `lead` est la case foulée et `opened` les autres
// cases nouvellement révélées par la cascade de ce pas (poche à 0 voisin).
// La couche Vue (App.vue) rejoue ces pas avec un décalage temporel et
// démasque `lead` + `opened` ensemble quand le robot arrive dessus — sans
// ça, une poche s'ouvrirait d'un coup dès la découverte du robot.
function performRobotWalk(game, originCell) {
    game.robotWalkInProgress = true

    const steps = []
    let current = originCell

    for (let step = 0; step < ROBOT_MAX_STEPS; step++) {
        let candidates = getNeighbors(game, current).filter(
            neighbor => !neighbor.revealed && !neighbor.flagged
        )

        if (candidates.length === 0) {
            break
        }

        if (step < ROBOT_SAFE_STEPS) {
            const safeCandidates = candidates.filter(neighbor => !neighbor.isMine)

            // Si tous les candidats sont minés, pas le choix : on garde la
            // liste complète plutôt que de bloquer la marche.
            if (safeCandidates.length > 0) {
                candidates = safeCandidates
            }
        }

        const next = candidates[Math.floor(Math.random() * candidates.length)]

        if (next.isMine) {
            // Neutre (roadmap point 6) : révélée pour que le joueur voie ce
            // qui a arrêté le robot, mais sans passer par la branche mine
            // normale d'openCell — pas de minesTriggeredCount, pas de
            // jostle, pas de marquage "wrong". Ce n'est pas une erreur du
            // joueur, contrairement à un clic direct sur cette même case.
            next.revealed = true
            steps.push({ lead: next, opened: [] })
            break
        }

        const revealedBefore = revealedCellSet(game)
        openCell(game, next)

        const opened = []
        for (const cell of game.cells.values()) {
            if (cell.revealed && cell !== next && !revealedBefore.has(cell)) {
                opened.push(cell)
            }
        }

        steps.push({ lead: next, opened })
        current = next

        // Si next était une case à 0 voisin, sa cascade vient de révéler toute
        // une poche autour de lui : `current` se retrouve encerclé de cases
        // révélées et la marche s'arrêterait là au prochain tour. On la fait
        // repartir du bord de la poche — la case déjà ouverte (next ou une du
        // lot) la plus proche de next qui a encore un voisin non révélé — pour
        // que le robot continue jusqu'à une mine ou ROBOT_MAX_STEPS.
        if (!hasUnrevealedNeighbor(game, current)) {
            const edges = [next, ...opened].filter(cell => hasUnrevealedNeighbor(game, cell))

            if (edges.length > 0) {
                edges.sort((a, b) =>
                    Math.hypot(a.x - next.x, a.y - next.y) - Math.hypot(b.x - next.x, b.y - next.y)
                )
                current = edges[0]
            }
        }
    }

    game.robotWalkInProgress = false
    return steps
}

function relocateMine(game, cell, excludedCells) {
    if (!cell.isMine) {
        return
    }
    
    const candidates = [...game.cells.values()].filter(
        other => !other.isMine && !excludedCells.includes(other)
    )
    
    const target = candidates[Math.floor(Math.random() * candidates.length)]
    
    cell.isMine = false
    target.isMine = true
}

function ensureSafeZone(game, cell) {
    const safeZone = [cell, ...getNeighbors(game, cell)]
    
    for (const safeCell of safeZone) {
        relocateMine(game, safeCell, safeZone)
    }
    
    countNeighborMines(game)
}



function checkVictory(game) {
    const safeCells = [...game.cells.values()].filter(cell => !cell.isMine)
    const allRevealed = safeCells.every(cell => cell.revealed)
    
    if (allRevealed) {
        game.status = "won"
    }
}

function markWrong(game, cell) {
    const neighbors = getNeighbors(game, cell)
    
    for (const neighbor of neighbors) {
        if (!neighbor.isMine && neighbor.flagged) {
            neighbor.wrong = true
        }
    }
}

function revealAllMines(game) {
    for (const cell of game.cells.values()) {
        if (cell.isMine && !cell.flagged) {
            cell.revealed = true
        }
    }
}

function revealAround(game, cell) {
    const neighbors = getNeighbors(game, cell)
    // Une mine déjà révélée (explosée en infini, le jeu continue) ne peut
    // plus être flaggée, mais elle est tout aussi "identifiée" qu'une mine
    // flaggée : elle doit compter pareil, sinon le chord reste bloqué à
    // jamais dès qu'une mine voisine a déjà sauté.
    const accountedForNeighbors = neighbors.filter(
        neighbor => neighbor.flagged || (neighbor.isMine && neighbor.revealed)
    )

    if (accountedForNeighbors.length === cell.neighborMines) {
        let triggeredMine = false

        for (const neighbor of neighbors) {
            if (!neighbor.revealed && !neighbor.flagged) {
                openCell(game, neighbor)

                if (neighbor.isMine) {
                    triggeredMine = true
                }
            }
        }

        // Le mauvais flag qui a fait croire le compte bon peut être voisin de
        // cette case chordée sans être voisin de la mine elle-même (les deux
        // ne sont voisins que d'un tiers commun) — le markWrong déclenché
        // dans openCell ne regarde qu'autour de la mine, donc on complète ici
        // avec le voisinage de la case chordée.
        if (triggeredMine) {
            markWrong(game, cell)
        }
    }
}

function revealNeighbors(game, cell) {
    const neighbors = getNeighbors(game, cell)
    
    for (const neighbor of neighbors) {
        if (!neighbor.revealed && !neighbor.flagged) {
            openCell(game, neighbor)
        }
    }
}

export function toggleFlag(game, cell) {
    if (cell.revealed) {
        return
    }

    if (game.status !== "playing") {
        return
    }

    cell.flagged = !cell.flagged
    game.flaggedCount += cell.flagged ? 1 : -1

    if (cell.flagged) {
        game.everFlagged = true
    } else {
        cell.wrong = false
    }
}

// Nombre de mines déclenchées pour atteindre l'assombrissement maximal.
// Valeur à ajuster en jouant. Exposée en tant que game.darknessMineThreshold
// (cf. createInfiniteGame) plutôt que figée en constante : le mode 3
// (roadmap point 10) s'en sert pour plafonner en bien moins de mines.
export const DEFAULT_DARKNESS_MINE_THRESHOLD = 15

export function getDarkness(game) {
    if (game.mode !== "infinite" || game.status !== "playing") {
        return 0
    }

    // heartsCollectedCount compense minesTriggeredCount dans ce ratio sans
    // jamais le modifier lui-même : minesTriggeredCount reste l'historique
    // brut (affiché tel quel) — seul l'effet sur le voile est amorti par les
    // cœurs. canGiveUp ci-dessous applique la même compensation.
    return Math.min(1, getEffectiveMines(game) / game.darknessMineThreshold)
}

function getEffectiveMines(game) {
    return Math.max(0, game.minesTriggeredCount - game.heartsCollectedCount)
}

// Même seuil net que getDarkness (mines moins cœurs) plutôt que le compteur
// brut : sinon le bouton restait affiché avec une visibilité redevenue
// parfaite (ex. autant de cœurs trouvés que de mines déclenchées, darkness
// retombé à 0) simplement parce que le brut avait franchi le seuil un jour.
export function canGiveUp(game) {
    return (
        game.mode === "infinite" &&
        game.status === "playing" &&
        getEffectiveMines(game) >= game.darknessMineThreshold
    )
}

export function giveUp(game) {
    if (!canGiveUp(game)) {
        return
    }

    game.status = "lost"
}

export function getVisibleCells(game, originX, originY, viewportWidth, viewportHeight) {
  const visibleCells = []

  for (let y = 0; y < viewportHeight; y++) {
    for (let x = 0; x < viewportWidth; x++) {
      visibleCells.push(getCell(game, originX + x, originY + y))
    }
  }

  return visibleCells
}
