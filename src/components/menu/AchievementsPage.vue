<script setup>
import { ref, computed } from "vue"
import { ACHIEVEMENTS, unlockedAchievements } from "../../state/achievements"
import { legacyUnlocked } from "../../state/shop"
import { formatDateTime } from "../../dateFormat"

// Les achievements marqués `gate: 'legacy'` (Pro / Ultra Pro / Noob, rattachés
// au mode Legacy) sont masqués tant que le mode n'est pas acheté. Ils sont en
// fin de `ACHIEVEMENTS`, donc apparaissent en bas de liste une fois débloqués.
const visibleAchievements = computed(() =>
  ACHIEVEMENTS.filter(
    (a) => !a.gate || (a.gate === "legacy" && legacyUnlocked.value),
  ),
)

// Indice d'un achievement encore verrouillé, révélé au tap sur sa ligne — un
// seul ouvert à la fois, retaper referme. Repart fermé à chaque ouverture de
// la page (elle est recréée).
const openHintId = ref(null)

function toggleHint(id) {
  openHintId.value = openHintId.value === id ? null : id
}
</script>

<template>
  <section class="menu-page">
    <div class="menu-section-title">ACHIEVEMENTS</div>
    <ul class="achievement-list">
      <!-- Ligne verrouillée : cliquable pour dévoiler l'indice (à la place
           du "???"). role/tabindex/keydown pour que ce soit aussi
           atteignable au clavier, la ligne n'étant pas un vrai <button>. -->
      <li
        v-for="achievement in visibleAchievements"
        :key="achievement.id"
        class="achievement-row"
        :class="{
          'achievement-row-locked': !unlockedAchievements[achievement.id],
        }"
        :role="unlockedAchievements[achievement.id] ? null : 'button'"
        :tabindex="unlockedAchievements[achievement.id] ? null : 0"
        @click="
          !unlockedAchievements[achievement.id] && toggleHint(achievement.id)
        "
        @keydown.enter.prevent="
          !unlockedAchievements[achievement.id] && toggleHint(achievement.id)
        "
        @keydown.space.prevent="
          !unlockedAchievements[achievement.id] && toggleHint(achievement.id)
        "
      >
        <svg
          v-if="unlockedAchievements[achievement.id]"
          :viewBox="`0 0 ${achievement.pixels.width} ${achievement.pixels.height}`"
          class="achievement-icon"
          shape-rendering="crispEdges"
        >
          <rect
            v-for="(p, i) in achievement.pixels"
            :key="i"
            :x="p.x"
            :y="p.y"
            width="1"
            height="1"
            :fill="p.color"
          />
        </svg>
        <!-- Non débloquée : icône aussi cachée (pas juste le texte), un
             "?" générique plutôt qu'un teaser de l'asset réel. -->
        <div v-else class="achievement-icon achievement-icon-locked">?</div>
        <div class="achievement-text">
          <div
            :class="
              !unlockedAchievements[achievement.id] &&
              openHintId === achievement.id
                ? 'achievement-hint'
                : 'achievement-title'
            "
          >
            {{
              unlockedAchievements[achievement.id]
                ? achievement.title
                : openHintId === achievement.id
                  ? achievement.hint
                  : "???"
            }}
          </div>
          <template v-if="unlockedAchievements[achievement.id]">
            <div class="achievement-description">
              {{ achievement.description }}
            </div>
            <div class="achievement-date">
              {{ formatDateTime(unlockedAchievements[achievement.id]) }}
            </div>
          </template>
        </div>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.achievement-list {
  /* Seule partie qui défile (cf. .run-list dans menu.css). */
  flex-shrink: 1;
  min-height: 0;
  overflow-y: auto;
  list-style: none;
  margin: 0;
  padding: 0;
  text-align: left;
  /* Largeur figée (et non dérivée du contenu) : sans ça, ouvrir un indice
     plus long que les lignes "???" élargit tout le .menu-panel d'un coup.
     max-width pour rester dans le panneau sur écran étroit. */
  width: 300px;
  max-width: 100%;
}

.achievement-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--color-cell-revealed-border);
}

.achievement-row:last-child {
  border-bottom: none;
}

/* Verrouillée = tapable pour révéler l'indice (cf. template). min-height
   réserve d'emblée la place d'un indice sur deux lignes (le max prévu, vu la
   largeur fixe de .achievement-list) : le "???" est sur une ligne, mais la
   rangée garde la même hauteur une fois l'indice dévoilé — pas de saut
   vertical. 58px = 2 lignes d'indice (~18px) + le padding 10px de
   .achievement-row de part et d'autre. */
.achievement-row-locked {
  cursor: pointer;
  min-height: 58px;
}

.achievement-icon {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
}

/* Générique (un "?" à la place de l'asset réel), pas un teaser de l'icône —
   même esprit que le titre "???" juste à côté. */
.achievement-icon-locked {
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: "Press Start 2P", monospace;
  font-size: 14px;
  color: var(--color-text);
  opacity: 0.4;
  border: 2px dashed var(--color-cell-revealed-border);
}

.achievement-title {
  font-size: 15px;
  color: var(--color-text-strong);
  font-weight: bold;
}

/* Prend la place du "???" (même emplacement que .achievement-title) au tap
   sur une ligne verrouillée. Gris atténué via --color-text + opacity plutôt
   qu'une couleur figée, pour rester lisible en thème clair comme sombre. */
.achievement-hint {
  font-size: 14px;
  font-style: italic;
  line-height: 1.3;
  color: var(--color-text);
  opacity: 0.6;
}

.achievement-description {
  margin-top: 2px;
  font-size: 14px;
  color: var(--color-text);
  line-height: 1.3;
}

/* Même traitement que .run-meta (dates des runs) : petit, atténué. */
.achievement-date {
  margin-top: 4px;
  font-size: 13px;
  color: var(--color-text);
  opacity: 0.7;
}
</style>
