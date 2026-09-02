<script setup>
import { computed } from 'vue'
import { MINE_PIXELS, FLAG_PIXELS, WRONG_PIXELS, ORIGIN_PIXELS, HEART_PIXELS, ROBOT_PIXELS } from '../icons'

const props = defineProps({
  cell: Object,
  seamless: Boolean,
  simplified: Boolean
})

// 'press-start' (pas 'pointerdown') volontairement : un nom qui n'existe pas
// nativement en DOM, pour ne courir aucun risque de retomber sur le même
// bug de fallthrough qu'on vient de corriger pour 'click'.
defineEmits(['click', 'flag', 'press-start'])

const isOrigin = computed(() => props.seamless && props.cell.x === 0 && props.cell.y === 0)
</script>

<template>
  <div class="cell"
    @click="$emit('click')"
    @pointerdown="$emit('press-start')"
    :class="{
      revealed: cell.revealed && !cell.pendingReveal,
      seamless,
      simplified,
      'simplified-flagged': simplified && cell.flagged,
      'simplified-mine': simplified && cell.revealed && !cell.pendingReveal && cell.isMine,
      detonated: cell.detonated,
      'simplified-heart': simplified && cell.revealed && !cell.pendingReveal && cell.isHeart,
      'simplified-robot': simplified && cell.robotHere
    }"
    :style="{ transform: `rotate(${cell.tiltDeg}deg)` }"
    @contextmenu.prevent="$emit('flag')"
  >
    <svg v-if="isOrigin" viewBox="0 0 9 9" class="origin-marker" shape-rendering="crispEdges">
      <rect v-for="(p, i) in ORIGIN_PIXELS" :key="i" :x="p.x" :y="p.y" width="1" height="1" :fill="p.color" />
    </svg>
    <template v-if="!simplified">
      <span v-if="cell.flagged" class="cell-content">
          <svg v-if="cell.wrong" viewBox="0 0 9 9" class="icon" shape-rendering="crispEdges">
            <rect v-for="(p, i) in WRONG_PIXELS" :key="i" :x="p.x" :y="p.y" width="1" height="1" :fill="p.color" />
          </svg>
          <svg v-else viewBox="0 0 9 9" class="icon" shape-rendering="crispEdges">
            <rect v-for="(p, i) in FLAG_PIXELS" :key="i" :x="p.x" :y="p.y" width="1" height="1" :fill="p.color" />
          </svg>
      </span>
      <span v-else-if="cell.revealed && !cell.pendingReveal" class="cell-content">
        <svg v-if="cell.isMine" viewBox="0 0 9 9" class="icon" shape-rendering="crispEdges">
          <rect v-for="(p, i) in MINE_PIXELS" :key="i" :x="p.x" :y="p.y" width="1" height="1" :fill="p.color" />
        </svg>
        <template v-else-if="cell.isHeart">
          <svg
            viewBox="0 0 9 9"
            class="icon heart-icon"
            :class="{ 'pop-in': !cell.heartPopped }"
            shape-rendering="crispEdges"
            @animationend="cell.heartPopped = true"
          >
            <rect v-for="(p, i) in HEART_PIXELS" :key="i" :x="p.x" :y="p.y" width="1" height="1" :fill="p.color" />
          </svg>
          <span v-if="cell.neighborMines > 0" :class="['cell-number', 'n' + cell.neighborMines, 'above-icon']">{{ cell.neighborMines }}</span>
        </template>
        <span v-else-if="cell.neighborMines > 0" :class="['cell-number', 'n' + cell.neighborMines]">{{ cell.neighborMines }}</span>
      </span>
      <!-- Sprite du robot (roadmap point 6) : indépendant de cell.isRobot
           (vrai pour toujours sur la case d'origine) — c'est robotHere qui
           pilote l'affichage, piloté par App.vue pendant l'animation de la
           marche, et qui redevient faux partout une fois la marche finie. Se
           superpose à n'importe quel contenu de la case (chiffre, cœur,
           mine sur laquelle le robot s'arrête) plutôt que de s'y substituer. -->
      <svg v-if="cell.robotHere" viewBox="0 0 9 9" class="icon robot-icon" shape-rendering="crispEdges">
        <rect v-for="(p, i) in ROBOT_PIXELS" :key="i" :x="p.x" :y="p.y" width="1" height="1" :fill="p.color" />
      </svg>
    </template>
  </div>
</template>

<style scoped>
.cell {
  --notch: calc(var(--cell-size) / 9);
  position: relative;
  width: var(--cell-size);
  height: var(--cell-size);
  font-size: 0.75rem;
  font-weight: bold;
  display: flex;
  justify-content: center;
  align-items: center;
  background: var(--color-cell-unrevealed-bg);
  border: 1px solid var(--color-cell-unrevealed-border);
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  cursor: pointer;
  box-sizing: border-box;
  clip-path: polygon(
    0 var(--notch), var(--notch) var(--notch), var(--notch) 0,
    calc(100% - var(--notch)) 0, calc(100% - var(--notch)) var(--notch), 100% var(--notch),
    100% calc(100% - var(--notch)), calc(100% - var(--notch)) calc(100% - var(--notch)), calc(100% - var(--notch)) 100%,
    var(--notch) 100%, var(--notch) calc(100% - var(--notch)), 0 calc(100% - var(--notch))
  );
}
.cell.revealed {
  background: var(--color-cell-revealed-bg);
  border-color: var(--color-cell-revealed-border);
  cursor: default;
}

/* La mine sur laquelle la partie classic a été perdue (cell.detonated, posé
   dans openCell) plutôt que le reste des mines révélées par revealAllMines,
   toutes neutres. Plus d'aplat rouge (gris sur rouge = peu lisible, et le
   pavé écrasait la case) : fond de case révélée normal, liseré rouge 2px
   (border-box → pas de décalage, suit le clip-path en escalier comme la
   bordure 1px de base) et la mine elle-même repassée en quasi-noir
   (--color-mine-detonated, thème-aware) pour trancher parmi les autres
   mines grises. Après .cell.revealed dans l'ordre des règles. */
.cell.detonated {
  border: 2px solid var(--color-wrong);
}

.cell.detonated .icon rect {
  fill: var(--color-mine-detonated);
}

.cell.seamless:not(.revealed) {
  border: none;
  background: transparent;
}

/* Même seuil de zoom "simplifié" : en plus de cacher icônes/chiffres (cf.
   plus bas), on retire aussi la découpe en escalier (clip-path) et la
   bordure — à cette taille elles ne se voient plus vraiment, ne coûtent pas
   rien à calculer sur plusieurs milliers de cases, et une case pleinement
   rectangulaire colle mieux à une silhouette lue comme un aplat continu
   plutôt qu'une mosaïque de pixels dentelés. */
.cell.simplified {
  clip-path: none;
  border: none;
}

/* En dessous du seuil de zoom "simplifié" (cf. SIMPLIFIED_RENDER_THRESHOLD
   dans App.vue), plus d'icône/chiffre — juste un aplat de couleur, pour que
   la zone explorée se lise comme une silhouette plutôt qu'un bruit
   illisible de pixels à cette taille. simplified n'est vrai qu'en infini
   (cf. App.vue), donc toujours accompagné de seamless : le sélecteur inclut
   .seamless explicitement pour égaler la spécificité de la règle
   .cell.seamless:not(.revealed) ci-dessus (que ces cases non-révélées
   matchent aussi) — sinon le :not(), plus spécifique qu'une simple classe,
   gagnerait et écraserait la couleur avec un fond transparent. */
.cell.seamless.simplified-flagged {
  background: var(--color-flag-cloth);
}

.cell.seamless.simplified-mine {
  background: var(--color-wrong);
}

.cell.seamless.simplified-heart {
  background: var(--color-heart);
}

.cell.seamless.simplified-robot {
  background: var(--color-robot);
}

/* Rendu avant .cell-content dans le template, donc peint derrière : un
   watermark discret, pas devant le chiffre/l'icône de la case. */
.origin-marker {
  position: absolute;
  inset: 0;
  margin: auto;
  width: 60%;
  height: 60%;
  pointer-events: none;
}

.cell-content {
  /* Sans ça, ce <span> serait lui-même l'unique flex item de .cell (au lieu
     de son contenu), et sa propre boîte en ligne (avec la réserve d'espace
     sous les SVG pour leur "descender") décalait légèrement l'icône/le
     chiffre par rapport au centre réel de la case. */
  display: contents;
}

.icon {
  display: block;
  width: 70%;
  height: 70%;
}

/* Watermark en arrière-plan : positionné en absolu comme .origin-marker,
   donc peint dans la couche des éléments positionnés — qui passe TOUJOURS
   derrière un élément également positionné mais plus tard dans le DOM (cf.
   .above-icon ci-dessous), quel que soit l'ordre visuel qu'on imaginerait.
   Opacité gardée pour rester lisible (cœur/robot) sans dominer le chiffre.
   Partagé entre .heart-icon et .robot-icon : même traitement watermark pour
   toute case spéciale avec un chiffre de voisinage à afficher par-dessus. */
.heart-icon,
.robot-icon {
  position: absolute;
  inset: 0;
  margin: auto;
  opacity: 0.85;
}

/* Le pop du cœur ne doit se jouer qu'UNE fois, à la révélation. Sans garde,
   sortir le cœur du viewport puis l'y ramener re-monte le <svg> (le v-for de
   MineGrid ne rend que les cases visibles + une marge) et rejoue
   l'animation. cell.heartPopped passe à true sur animationend et persiste
   sur l'objet cell — stable dans la Map (infini) / la grille (classique) le
   temps de la partie — donc les montages suivants n'ajoutent plus .pop-in.
   (Non persisté dans le snapshot localStorage : après un rechargement
   complet de la page, un cœur déjà ramassé et visible re-pop une fois.) */
.heart-icon.pop-in {
  animation: icon-pop 0.75s ease-out;
}

/* Le robot, lui, "saute" à chaque case de sa marche (robotHere bascule case
   par case) : un pop à chaque montage est le comportement voulu ici. */
.robot-icon {
  animation: icon-pop 0.75s ease-out;
}

/* position:relative (sans offset, donc sans déplacer la case) fait peindre
   ce chiffre dans la même couche que .heart-icon/.robot-icon (éléments
   positionnés, dans l'ordre du DOM) au lieu de la couche des flex items
   normaux qui, elle, peint TOUJOURS derrière les éléments positionnés — sans
   ça le chiffre resterait caché sous l'icône quelle que soit son opacité.
   Placé après l'icône dans le template : entre deux éléments positionnés à
   égalité de z-index, le plus tardif dans le DOM peint par-dessus. Une fois
   cet ordre garanti, un léger voile (contrairement au 0.4 d'avant, qui
   rendait le chiffre illisible quand c'est l'icône qui passait devant) reste
   lisible sans effacer l'icône juste en dessous. */
/* color: seule utilisatrice actuelle de .above-icon (cf. template) est le
   chiffre affiché sur un cœur — priorité sur .n1-.n8 grâce aux deux classes
   ici contre une seule sur .nN, sans dépendre de l'ordre des règles. */
.cell-number.above-icon {
  position: relative;
  opacity: 0.6;
  color: var(--color-heart-number);
}

/* Animation ponctuelle (scale-in), pas une boucle : aucun coût continu sur
   les cases affichées. Le déclenchement est géré au-dessus — .pop-in gardé
   par cell.heartPopped pour le cœur, montage libre pour le robot. */
@keyframes icon-pop {
  0% { transform: scale(0); }
  60% { transform: scale(1.15); }
  100% { transform: scale(1); }
}

.cell-number {
  font-family: 'Press Start 2P', monospace;
  /* Relatif à --cell-size (0.5 reproduit les 14px d'origine à la taille par
     défaut de 28px) plutôt qu'un px fixe, pour garder la même proportion
     chiffre/case à tous les niveaux de zoom. */
  font-size: calc(var(--cell-size) * 0.5);
}

.n1 { color: var(--color-n1); }
.n2 { color: var(--color-n2); }
.n3 { color: var(--color-n3); }
.n4 { color: var(--color-n4); }
.n5 { color: var(--color-n5); }
.n6 { color: var(--color-n6); }
.n7 { color: var(--color-n7); }
.n8 { color: var(--color-n8); }
</style>
