// Parse un pictogramme ASCII 9x9 (voir le handoff design) en liste de pixels
// {x, y, color} — plus facile à relire/vérifier qu'un tableau de coordonnées
// écrit à la main, et ne coûte rien puisque calculé une seule fois au
// chargement du module (partagé par tous les composants qui l'importent).
function buildPixelGrid(pattern, colors) {
  const pixels = []
  const rows = pattern.trim().split('\n').map((row) => row.trim())

  rows.forEach((row, y) => {
    ;[...row].forEach((char, x) => {
      if (char !== '.') {
        pixels.push({ x, y, color: colors[char] })
      }
    })
  })

  // Attaché au tableau (pas juste local) : les icônes de badge d'achievement
  // ne sont pas toutes carrées comme les icônes in-game (voir plus bas) — les
  // consommateurs qui en ont besoin lisent pixels.width/height pour poser le
  // bon viewBox plutôt qu'un "0 0 9 9" en dur partout.
  pixels.width = rows[0]?.length ?? 0
  pixels.height = rows.length

  return pixels
}

// Les couleurs référencent les custom properties de style.css (pas de hex en
// dur) : les icônes suivent automatiquement le thème clair/sombre, sans
// dupliquer les grilles de pixels par thème. `fill` en SVG accepte var()
// comme n'importe quelle propriété CSS.
export const MINE_PIXELS = buildPixelGrid(
  `
  .....X...
  .X.XXX.X.
  ..XXXXX..
  .XXHMXXX.
  XXXMXXXXX
  .XXXXXXX.
  ..XXXXX..
  .X.XXX.X.
  .....X...
  `,
  { X: 'var(--color-mine-body)', H: 'var(--color-mine-highlight)', M: 'var(--color-mine-mid)' }
)

export const FLAG_PIXELS = buildPixelGrid(
  `
  .........
  ..PFFFF..
  ..PFFF...
  ..PFF....
  ..PF.....
  ..P......
  ..P......
  ..P......
  .PPP.....
  `,
  { P: 'var(--color-flag-pole)', F: 'var(--color-flag-cloth)' }
)

export const WRONG_PIXELS = buildPixelGrid(
  `
  XX.....XX
  XXX...XXX
  .XXX.XXX.
  ..XXXXX..
  ...XXX...
  ..XXXXX..
  .XXX.XXX.
  XXX...XXX
  XX.....XX
  `,
  { X: 'var(--color-wrong)' }
)

// Un seul pixel en H (teinte plus claire) pour le reflet — même convention
// minimaliste que MINE_PIXELS (H/M) : un aplat presque uniforme suffit, pas
// besoin de dégradé pour lire "case spéciale" à l'échelle d'une case.
export const HEART_PIXELS = buildPixelGrid(
  `
  .........
  .FF...FF.
  FHFF.FFFF
  FFFFFFFFF
  FFFFFFFFF
  .FFFFFFF.
  ..FFFFF..
  ...FFF...
  ....F....
  `,
  { F: 'var(--color-heart)', H: 'var(--color-heart-highlight)' }
)

// Tête de robot dorée (roadmap point 6) : antenne (H, teinte claire) au
// sommet, deux yeux (H) séparés par un espace, grille en guise de bouche.
export const ROBOT_PIXELS = buildPixelGrid(
  `
  ....H....
  ....X....
  ..XXXXX..
  .XXXXXXX.
  .XHX.XHX.
  .XXXXXXX.
  .XX.X.XX.
  ..XXXXX..
  ...XXX...
  `,
  { X: 'var(--color-robot)', H: 'var(--color-robot-highlight)' }
)

export const MENU_PIXELS = buildPixelGrid(
  `
  .........
  XXXXXXXXX
  XXXXXXXXX
  .........
  XXXXXXXXX
  XXXXXXXXX
  .........
  XXXXXXXXX
  XXXXXXXXX
  `,
  { X: 'var(--color-menu-bars)' }
)

// Badge d'aide (point 18 du roadmap) : cercle plein (même silhouette que
// ORIGIN_PIXELS, mais rempli) avec un "?" en creux dedans. Couleurs de
// chrome UI (chrome-border/panel-bg, mêmes que .sort-chip.active et une
// radio cochée dans BurgerMenu.vue) plutôt que la palette vive des cases
// spéciales (mine/cœur/robot) : ce badge est un contrôle d'interface, pas
// une case du plateau, il ne doit pas se confondre avec elles au premier
// coup d'œil.
export const HELP_PIXELS = buildPixelGrid(
  `
  .........
  ...CCC...
  ..CQQQC..
  .CCCCQCC.
  .CCCQCCC.
  .CCCCCCC.
  ..CCQCC..
  ...CCC...
  .........
  `,
  { C: 'var(--color-chrome-border)', Q: 'var(--color-panel-bg)' }
)

// Bouton "recentrer sur l'origine" en vue simplifiée (roadmap point 9,
// session 2026-08-28). Couleurs de chrome UI, même logique que HELP_PIXELS
// ci-dessus : un contrôle d'interface, pas une case du plateau.
export const HOME_PIXELS = buildPixelGrid(
  `
  ....X....
  ...XXX...
  ..XXXXX..
  .XXXXXXX.
  .XXXXXXX.
  .XXXXXXX.
  .XXX.XXX.
  .XXX.XXX.
  .........
  `,
  { X: 'var(--color-chrome-border)' }
)

// Badges d'achievement (roadmap point 8) — pas contraintes à 9×9 comme les
// icônes ci-dessus (celles-là doivent tenir dans une case du plateau), donc
// une résolution plus généreuse pour rester lisibles sur des formes plus
// complexes. Générées/vérifiées par rendu plutôt que dessinées à l'œil (cf.
// session 2026-08-28) pour éviter le genre d'erreur de lecture qu'un pattern
// ASCII fait à la main peut cacher. Couleur de chrome UI uniforme comme
// HELP_PIXELS/HOME_PIXELS : ce sont des trophées, pas des cases du plateau.

// Pro : deux anneaux qui se recoupent au centre.
export const INFINITY_PIXELS = buildPixelGrid(
  `
  ..XXX....XXX..
  .XX.XX..XX.XX.
  XX...XXXX...XX
  X.....XX.....X
  XX...XXXX...XX
  .XX.XX..XX.XX.
  ..XXX....XXX..
  `,
  { X: 'var(--color-chrome-border)' }
)

// Ultra Pro : case à bordure pointillée.
export const DASHED_BORDER_PIXELS = buildPixelGrid(
  `
  X.X.X.X.X.X.X
  .............
  X...........X
  .............
  X...........X
  .............
  X...........X
  .............
  X...........X
  .............
  X...........X
  .............
  X.X.X.X.X.X.X
  `,
  { X: 'var(--color-chrome-border)' }
)

// Traveler : règle/mètre.
export const RULER_PIXELS = buildPixelGrid(
  `
  XXXXXXXXXXXXX
  X.X.X.X.X.X.X
  X.X.X.X.X.X.X
  X.X.X.X.X.X.X
  XXXXXXXXXXXXX
  `,
  { X: 'var(--color-chrome-border)' }
)

// Ultra Traveler : fusée (nez, corps, ailerons décollés, traînée de flamme).
export const ROCKET_PIXELS = buildPixelGrid(
  `
  ....X....
  ...XXX...
  ...XXX...
  ..XXXXX..
  ..XXXXX..
  ..XXXXX..
  ..XXXXX..
  .X.XXX.X.
  X..XXX..X
  ....X....
  ....X....
  `,
  { X: 'var(--color-chrome-border)' }
)

// Iron Will : bouclier.
export const SHIELD_PIXELS = buildPixelGrid(
  `
  .XXXXXXX.
  XXXXXXXXX
  XXXXXXXXX
  XXXXXXXXX
  XXXXXXXXX
  .XXXXXXX.
  .XXXXXXX.
  ..XXXXX..
  ..XXXXX..
  ...XXX...
  ....X....
  `,
  { X: 'var(--color-chrome-border)' }
)

// Squad : trois silhouettes de robot groupées (antenne + tête), pas
// ROBOT_PIXELS répétée telle quelle — ce dernier ne reste lisible qu'à la
// taille d'une case entière, trois instances côte à côte à cette échelle
// ne l'auraient pas été.
export const SQUAD_PIXELS = buildPixelGrid(
  `
  ..X...X...X..
  .XXX.XXX.XXX.
  .XXX.XXX.XXX.
  .XXX.XXX.XXX.
  `,
  { X: 'var(--color-chrome-border)' }
)

// Bouquet : trois cœurs (HEART_PIXELS n'est pas repris, même raison que
// SQUAD_PIXELS ci-dessus) — couleur du cœur, pas le chrome UI uniforme du
// reste des badges, pour que le lien avec la case cœur du plateau saute aux
// yeux.
export const BOUQUET_PIXELS = buildPixelGrid(
  `
  .....F.F.....
  ....FFFFF....
  ....FFFFF....
  .....FFF.....
  .F.F..F..F.F.
  FFFFF...FFFFF
  FFFFF...FFFFF
  .FFF.....FFF.
  ..F.......F..
  `,
  { F: 'var(--color-heart)' }
)

// Marathon : drapeau à damier.
export const FINISH_FLAG_PIXELS = buildPixelGrid(
  `
  X........
  XXXXXXXX.
  XXX.XX.X.
  X.XX.XX..
  XXX.XX.X.
  X.XX.XX..
  XXXXXXXX.
  X........
  X........
  X........
  X........
  X........
  `,
  { X: 'var(--color-chrome-border)' }
)

// Seed Hunter : pousse/graine.
export const SPROUT_PIXELS = buildPixelGrid(
  `
  ....X....
  ...XXX...
  ..X.X.X..
  .X..X..X.
  ....X....
  ....X....
  ....X....
  ...XXX...
  ..XXXXX..
  ..XXXXX..
  ...XXX...
  `,
  { X: 'var(--color-chrome-border)' }
)

// Repère de la case de départ (0,0) en mode infini : un simple anneau "O",
// dessiné en watermark derrière le contenu normal de la case (chiffre ou
// case vide), plutôt que de changer la couleur de fond de la case.
export const ORIGIN_PIXELS = buildPixelGrid(
  `
  .........
  ...XXX...
  ..X...X..
  .X.....X.
  .X.....X.
  .X.....X.
  ..X...X..
  ...XXX...
  .........
  `,
  { X: 'var(--color-origin-ring)' }
)
