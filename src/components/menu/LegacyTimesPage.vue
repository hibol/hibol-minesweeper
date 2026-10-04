<script setup>
import { ref, computed, watch } from "vue"
import {
  legacyScores,
  LEGACY_SCORE_DIFFICULTIES,
} from "../../state/legacyScores"
import { fetchLegacyLeaderboard } from "../../state/legacyOnline"
import { formatLegacyTime } from "../../state/legacyTimeFormat"
import { useLeaderboard } from "../../composables/useLeaderboard"
import { formatDate } from "../../dateFormat"
import LeaderboardList from "./LeaderboardList.vue"

const LEGACY_DIFFICULTY_LABELS = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  expert: "Expert",
}

function localScores(difficulty) {
  return legacyScores.value[difficulty] ?? []
}

// S'ouvre sur la 1re difficulté qui a des temps (évite un "No times yet"
// trompeur si on n'a joué que l'Expert).
const difficulty = ref(
  LEGACY_SCORE_DIFFICULTIES.find((d) => localScores(d).length > 0) ??
    "beginner",
)

const localList = computed(() => localScores(difficulty.value))
// Autant de lignes que la difficulté la plus fournie, quelle que soit celle
// affichée (cf. LeaderboardList).
const localMaxCount = computed(() =>
  Math.max(...LEGACY_SCORE_DIFFICULTIES.map((d) => localScores(d).length)),
)

// Local relit legacyScores.js ; Online refait un fetch à chaque affichage,
// sans cache : sinon le joueur qui vient de battre son temps verrait encore
// l'ancien classement jusqu'au rechargement de la page.
const source = ref("local")

const {
  list: onlineList,
  status: onlineStatus,
  maxCount: onlineMaxCount,
  load: loadOnline,
} = useLeaderboard(difficulty, fetchLegacyLeaderboard)

function setSource(value) {
  source.value = value
  if (value === "online") {
    loadOnline()
  }
}

watch(difficulty, () => {
  if (source.value === "online") {
    loadOnline()
  }
})

function onlineRowKey(row) {
  return `${row.username}-${row.submittedAt}`
}
</script>

<template>
  <section class="menu-page">
    <div class="menu-section-title">LEGACY TIMES</div>
    <!-- Une difficulté à la fois — chips repris de INFINITE RUNS. -->
    <div class="sort-chips">
      <button
        v-for="item in LEGACY_SCORE_DIFFICULTIES"
        :key="item"
        class="sort-chip"
        :class="{ active: difficulty === item }"
        @click="difficulty = item"
      >
        {{ LEGACY_DIFFICULTY_LABELS[item] }}
      </button>
    </div>
    <!-- Local (legacyScores.js, cet appareil) vs Online (classement
         serveur, cf. legacyOnline.js) — deux sources distinctes, jamais
         mélangées. -->
    <div class="sort-chips">
      <button
        class="sort-chip"
        :class="{ active: source === 'local' }"
        @click="setSource('local')"
      >
        Local
      </button>
      <button
        class="sort-chip"
        :class="{ active: source === 'online' }"
        @click="setSource('online')"
      >
        Online
      </button>
    </div>

    <LeaderboardList
      v-if="source === 'local'"
      :rows="localList"
      :pad-count="localMaxCount"
      :row-key="(row) => row.timestamp"
    >
      <template #row="{ row, rank }">
        <div class="run-main">
          <span class="run-rank">#{{ rank }}</span>
          <span class="run-time">{{ formatLegacyTime(row.timeMs) }}</span>
          <span v-if="row.name" class="run-name" :title="row.name">{{
            row.name
          }}</span>
        </div>
        <div class="run-meta">{{ formatDate(row.timestamp) }}</div>
      </template>
    </LeaderboardList>

    <LeaderboardList
      v-else
      :rows="onlineList"
      :status="onlineStatus"
      :pad-count="onlineMaxCount"
      :row-key="onlineRowKey"
      error-message="Couldn't load — tap Online to retry"
    >
      <template #row="{ row, rank }">
        <div class="run-main">
          <span class="run-rank">#{{ rank }}</span>
          <span class="run-time">{{ formatLegacyTime(row.timeMs) }}</span>
          <span class="run-name" :title="row.username">{{ row.username }}</span>
        </div>
        <div class="run-meta">{{ formatDate(row.submittedAt) }}</div>
      </template>
    </LeaderboardList>
  </section>
</template>

<style scoped>
/* Temps mis en avant : police des chiffres du jeu, comme le chrono du
   footer, à l'échelle d'une ligne de liste. */
.run-time {
  font-family: "Press Start 2P", monospace;
  font-size: 12px;
  color: var(--color-text-strong);
}
</style>
