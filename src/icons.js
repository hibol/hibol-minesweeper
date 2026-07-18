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
  { X: '#2b2b2b', H: '#5a5a5a', M: '#444444' }
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
  { P: '#333333', F: '#d32f2f' }
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
  { X: '#d32f2f' }
)
