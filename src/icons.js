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
  ...H.H...
  ...X.X...
  .XXXXXXX.
  .XXXXXXX.
  .XHXXXHX.
  .XXXXXXX.
  .XX.X.XX.
  .XXXXXXX.
  ..XXXXX..
  `,
  { X: 'var(--color-robot)', H: 'var(--color-robot-highlight)' }
)

// Chasse au trésor (roadmap point 10). Coffre : couvercle (L, teinte claire),
// corps (X) et bandes/serrure dorées (G) — la case révélée qui déclenche la
// victoire du jour.
export const CHEST_PIXELS = buildPixelGrid(
  `
  .........
  ..LLLLL..
  .LLLLLLL.
  LLLGGGLLL
  XXXXXXXXX
  XXXGGGXXX
  XXXGGGXXX
  XXXXXXXXX
  .XXXXXXX.
  `,
  {
    L: 'var(--color-chest-lid)',
    X: 'var(--color-chest)',
    G: 'var(--color-chest-gold)'
  }
)

// La monnaie : une pièce d'or frappée d'un "h" minuscule (le "hibol", nom
// dev + racine du titre). Corps doré (X, or du coffre, pas le chrome UI),
// monogramme dans la teinte brune foncée du coffre pour trancher. Comme le
// coffre, identique clair/sombre.
export const HIBOL_PIXELS = buildPixelGrid(
  `
  ..XXXXX..
  .XXXDXXX.
  XXXDXXXXX
  XXXDXXXXX
  XXXDDDXXX
  XXXDXDXXX
  XXXDXDXXX
  .XXXXXXX.
  ..XXXXX..
  `,
  {
    X: 'var(--color-chest-gold)',
    D: 'var(--color-chest)'
  }
)

// Tornade : entonnoir qui se resserre vers le bas, bandes alternées (X clair /
// D foncé) pour l'effet de rotation. Au reveal, relocalise le coffre.
export const TORNADO_PIXELS = buildPixelGrid(
  `
  XXXXXXXXX
  .DDDDDDD.
  .XXXXXXX.
  ..DDDDD..
  ..XXXXX..
  ...DDD...
  ...XXX...
  ....D....
  ....X....
  `,
  { X: 'var(--color-tornado)', D: 'var(--color-tornado-dark)' }
)

// Chrono de la chasse au trésor : plongeur en haut, cadran rond, deux
// aiguilles (12 h + ~4 h). Couleur de texte fort — c'est l'icône du compteur
// mis en avant du footer, pas une case du plateau.
export const STOPWATCH_PIXELS = buildPixelGrid(
  `
  ....X....
  ...XXX...
  ..X...X..
  .X..X..X.
  .X..X..X.
  .X..XX.X.
  .X.....X.
  ..X...X..
  ...XXX...
  `,
  { X: 'var(--color-text-strong)' }
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

// Squad : trois têtes de robot miniatures alignées (antenne, puis tête avec
// deux yeux et une bouche pleine), pas ROBOT_PIXELS répétée telle quelle — ce
// dernier ne reste lisible qu'à la taille d'une case entière, trois instances
// côte à côte à cette échelle ne l'auraient pas été.
export const SQUAD_PIXELS = buildPixelGrid(
  `
  .X...X...X..
  XXX.XXX.XXX.
  X.X.X.X.X.X.
  XXX.XXX.XXX.
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

// Objets du shop (mode Infini). Même silhouette pour les trois — un carré à
// coins arrondis, cerné d'un liseré noir (K) d'un pixel, reflet clair (H) dans
// le coin haut-gauche — seule la teinte du corps (X) change : bleu / turquoise
// / violet-rose. Une lettre gravée occupe le centre (lignes 2-6) et rappelle
// laquelle est laquelle : W(ind) / T(ravel) / X(-ray). E = pixel gravé (un ton
// plus sombre que le corps) ; G = pixel gravé qui tombe sous le reflet, teinte
// intermédiaire entre H et E (shade-lit). Couleurs dédiées plutôt que le
// chrome UI uniforme des autres badges, pour distinguer les trois d'un coup
// d'œil dans le tiroir en jeu. Théme-indépendantes comme --color-robot /
// --color-chest & co (contenu d'icône, pas de chrome) : définies seulement
// dans :root de style.css.
export const WIND_MACHINE_PIXELS = buildPixelGrid(
  `
  .KKKKKKK.
  KKXXXXXKK
  KXGHXXEXK
  KXGHXXEXK
  KXEXEXEXK
  KXEXEXEXK
  KXXEXEXXK
  KKXXXXXKK
  .KKKKKKK.
  `,
  {
    K: 'var(--color-machine-outline)',
    X: 'var(--color-wind-machine)',
    H: 'var(--color-wind-machine-highlight)',
    E: 'var(--color-wind-machine-shade)',
    G: 'var(--color-wind-machine-shade-lit)'
  }
)

export const TRAVEL_MACHINE_PIXELS = buildPixelGrid(
  `
  .KKKKKKK.
  KKXXXXXKK
  KXGGEEEXK
  KXHHEXXXK
  KXXXEXXXK
  KXXXEXXXK
  KXXXEXXXK
  KKXXXXXKK
  .KKKKKKK.
  `,
  {
    K: 'var(--color-machine-outline)',
    X: 'var(--color-travel-machine)',
    H: 'var(--color-travel-machine-highlight)',
    E: 'var(--color-travel-machine-shade)',
    G: 'var(--color-travel-machine-shade-lit)'
  }
)

export const XRAY_MACHINE_PIXELS = buildPixelGrid(
  `
  .KKKKKKK.
  KKXXXXXKK
  KXGHXXEXK
  KXHGXEXXK
  KXXXEXXXK
  KXXEXEXXK
  KXEXXXEXK
  KKXXXXXKK
  .KKKKKKK.
  `,
  {
    K: 'var(--color-machine-outline)',
    X: 'var(--color-xray-machine)',
    H: 'var(--color-xray-machine-highlight)',
    E: 'var(--color-xray-machine-shade)',
    G: 'var(--color-xray-machine-shade-lit)'
  }
)

// Smiley du mode Legacy (image du produit dans le shop) : la bouille du bouton
// "nouvelle partie" du démineur Windows — visage jaune cerné de noir, deux
// yeux, un sourire.
export const SMILEY_PIXELS = buildPixelGrid(
  `
  ..KKKKK..
  .KYYYYYK.
  KYYYYYYYK
  KYKYYYKYK
  KYYYYYYYK
  KYKYYYKYK
  KYYKKKYYK
  .KYYYYYK.
  ..KKKKK..
  `,
  { K: 'var(--color-legacy-smiley-line)', Y: 'var(--color-legacy-smiley)' }
)

// --- Skins cosmétiques du shop (mines + drapeaux alternatifs) ------------
// Mêmes règles que les autres icônes de contenu de case : 9x9, couleurs
// dédiées définies seulement dans :root (thème-indépendantes comme
// --color-mine-* / --color-flag-*). Rendues par MineCell.vue quand le skin
// est équipé (cf. cosmetics.js).

export const DYNAMITE_PIXELS = buildPixelGrid(
  `
  ....S....
  ....W....
  ...W.....
  ...XXX...
  ...HXE...
  ...XXX...
  ...HXE...
  ...XXX...
  ...XXX...
  `,
  {
    S: 'var(--color-dynamite-spark)',
    W: 'var(--color-dynamite-wick)',
    X: 'var(--color-dynamite-body)',
    H: 'var(--color-dynamite-highlight)',
    E: 'var(--color-dynamite-shade)'
  }
)

export const BARREL_PIXELS = buildPixelGrid(
  `
  ..XXXXX..
  .HKXXXKE.
  .HXXXXXE.
  .HXXWXXE.
  .HXXWXXE.
  .HXXXXXE.
  .HXXWXXE.
  .HKXXXKE.
  ..XXXXX..
  `,
  {
    X: 'var(--color-barrel-body)',
    K: 'var(--color-barrel-band)',
    W: 'var(--color-barrel-hazard)',
    H: 'var(--color-barrel-highlight)',
    E: 'var(--color-barrel-shade)'
  }
)

export const FLAG_SQUARE_PIXELS = buildPixelGrid(
  `
  .........
  ..PFFFF..
  ..PFFFF..
  ..PFFFF..
  ..PF.....
  ..P......
  ..P......
  ..P......
  .PPP.....
  `,
  { P: 'var(--color-flag-pole)', F: 'var(--color-flag-square)' }
)

export const FLAG_SWALLOW_PIXELS = buildPixelGrid(
  `
  .........
  ..PFFFF..
  ..PFFF...
  ..PF.F...
  ..PF.....
  ..P......
  ..P......
  ..P......
  .PPP.....
  `,
  { P: 'var(--color-flag-pole)', F: 'var(--color-flag-swallow)' }
)

export const FLAG_ROUND_PIXELS = buildPixelGrid(
  `
  .........
  ..PFFF...
  ..PFFFF..
  ..PFFFF..
  ..PFFF...
  ..P......
  ..P......
  ..P......
  .PPP.....
  `,
  { P: 'var(--color-flag-pole)', F: 'var(--color-flag-round)' }
)

// --- Badges d'achievement (chasse au trésor + shop, roadmap point 8) ------
// Même registre que les badges plus haut : couleur de chrome UI, sauf
// exceptions notées.

// Unscathed : gemme taillée (victoire sans une égratignure).
export const GEM_PIXELS = buildPixelGrid(
  `
  ....X....
  ...XXX...
  ..XXXXX..
  .XXXXXXX.
  XXXXXXXXX
  .XXXXXXX.
  ..XXXXX..
  ...XXX...
  ....X....
  `,
  { X: 'var(--color-chrome-border)' }
)

// Creature of Habit : page de calendrier (la chasse quotidienne, jour après
// jour).
export const CALENDAR_PIXELS = buildPixelGrid(
  `
  .X.....X.
  XXXXXXXXX
  X.......X
  X.XXXXX.X
  X.......X
  X.XXXXX.X
  X.......X
  XXXXXXXXX
  .........
  `,
  { X: 'var(--color-chrome-border)' }
)

// Machine Lover : engrenage.
export const GEAR_PIXELS = buildPixelGrid(
  `
  ...XXX...
  X.XXXXX.X
  XXXXXXXXX
  XXX...XXX
  XXX...XXX
  XXX...XXX
  XXXXXXXXX
  X.XXXXX.X
  ...XXX...
  `,
  { X: 'var(--color-chrome-border)' }
)

// Fashionista : étincelle (l'achat purement esthétique).
export const SPARKLE_PIXELS = buildPixelGrid(
  `
  ....X....
  ....X....
  X...X...X
  .X..X..X.
  ..XXXXX..
  .X..X..X.
  X...X...X
  ....X....
  ....X....
  `,
  { X: 'var(--color-chrome-border)' }
)

// Fully Equipped : les 3 couleurs des machines côte à côte, en miniature.
export const MACHINE_TRIO_PIXELS = buildPixelGrid(
  `
  AAA.BBB.CCC
  AAA.BBB.CCC
  AAA.BBB.CCC
  `,
  {
    A: 'var(--color-wind-machine)',
    B: 'var(--color-travel-machine)',
    C: 'var(--color-xray-machine)'
  }
)

// Hoarder : pile de pièces d'or (le reward qu'on regarde grossir sans jamais
// y toucher) — couleur de l'or du coffre, pas le chrome UI.
export const COINS_PIXELS = buildPixelGrid(
  `
  ..XXXXX..
  .XXXXXXX.
  .........
  ..XXXXX..
  .XXXXXXX.
  .........
  ..XXXXX..
  .XXXXXXX.
  .........
  `,
  { X: 'var(--color-chest-gold)' }
)

// Pacifist : symbole de la paix (100 cases sans faire sauter une mine).
export const PEACE_PIXELS = buildPixelGrid(
  `
  X.......X
  X.......X
  XX.....XX
  .X.....X.
  .X.....X.
  ..X...X..
  ..X...X..
  ...X.X...
  ....X....
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
