// Parse un pictogramme ASCII 9x9 (voir le handoff design) en liste de pixels
// {x, y, color} — plus facile à relire/vérifier qu'un tableau de coordonnées
// écrit à la main, et ne coûte rien puisque calculé une seule fois au
// chargement du module (partagé par tous les composants qui l'importent).
function buildPixelGrid(pattern, colors) {
  const pixels = []

  pattern.trim().split('\n').forEach((row, y) => {
    ;[...row.trim()].forEach((char, x) => {
      if (char !== '.') {
        pixels.push({ x, y, color: colors[char] })
      }
    })
  })

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
