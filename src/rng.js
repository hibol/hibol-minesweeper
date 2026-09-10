// Générateur pseudo-aléatoire *seedé* : à partir d'un seul entier, il redonne
// toujours la même suite de nombres. C'est ce qui rend une partie rejouable —
// contrairement à `Math.random()`, dont la suite change à chaque exécution et
// ne peut donc pas être reproduite (ni validée côté serveur pour un classement).
//
// `mulberry32` : un PRNG 32 bits compact et de bonne qualité pour du jeu (ce
// n'est pas de la crypto). Renvoie une *fonction* — chaque appel avance l'état
// interne `t` et rend un flottant dans [0, 1), comme `Math.random()`.
//
// Déjà utilisé tel quel par le voile de brouillard (`usePixelFog.js`), d'où
// l'extraction ici en module partagé.
export function mulberry32(seed) {
  let t = seed >>> 0
  return function () {
    t += 0x6d2b79f5
    let x = Math.imul(t ^ (t >>> 15), 1 | t)
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x)
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

// Entier dans [0, n) tiré du générateur passé — l'équivalent seedé de
// `Math.floor(Math.random() * n)`, le motif que `placeMines`/`relocateMine`
// répètent.
export function randomInt(rng, n) {
  return Math.floor(rng() * n)
}
