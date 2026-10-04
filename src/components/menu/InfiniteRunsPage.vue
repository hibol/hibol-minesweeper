<script setup>
import { ref, computed } from "vue"
import { loadTopRuns } from "../../state/runHistory"
import { hasFoundHeart, hasFoundRobot } from "../../state/discoveries"
import { fetchInfiniteLeaderboard } from "../../state/infiniteOnline"
import { useLeaderboard } from "../../composables/useLeaderboard"
import { formatDate, formatDateTime } from "../../dateFormat"
import RunStatIcons from "../RunStatIcons.vue"
import LeaderboardList from "./LeaderboardList.vue"

defineProps({
  infiniteUnlocked: Boolean,
})

const emit = defineEmits(["start-infinite-with-seed"])

// Relu à chaque ouverture : la page est recréée à chaque fois.
const topRuns = loadTopRuns()

// Tri du top local (roadmap point 19) : purement un tri d'affichage, ne
// touche jamais à runHistory.js (les runs restent stockées/limitées à 10
// par ordre revealedCount décroissant, cf. recordRun).
const SORT_CRITERIA = [
  { key: "revealedCount", label: "Cells" },
  { key: "distance", label: "Distance" },
  { key: "minesTriggeredCount", label: "Mines" },
  { key: "heartsCollectedCount", label: "Hearts", requires: hasFoundHeart },
  { key: "robotsTriggeredCount", label: "Robots", requires: hasFoundRobot },
]

// Trier par cœurs/robots n'a aucun intérêt tant que le joueur n'en a jamais
// croisé (tout à 0) — masque le chip plutôt que de l'afficher inutilement.
const visibleSortCriteria = computed(() =>
  SORT_CRITERIA.filter(
    (criterion) => !criterion.requires || criterion.requires.value,
  ),
)

const sortKey = ref("revealedCount")
const sortDir = ref("desc")

function setSort(key) {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === "desc" ? "asc" : "desc"
  } else {
    sortKey.value = key
    sortDir.value = "desc"
  }
}

// ?? 0 : les runs enregistrées avant l'ajout des cœurs/robots (roadmap point
// 9) n'ont pas ces champs — les traiter comme 0 plutôt que undefined, sinon
// la soustraction du comparateur produit NaN et casse le tri.
const sortedRuns = computed(() => {
  const factor = sortDir.value === "desc" ? -1 : 1
  return [...topRuns].sort(
    (a, b) => factor * ((a[sortKey.value] ?? 0) - (b[sortKey.value] ?? 0)),
  )
})

// Classement en ligne : 4 tableaux distincts (metric x category), jamais
// mélangés. Labels "No"/"Yes" (sous "Machines used:") : les clés serveur
// ("clean"/"assisted") ne changent pas, seul l'affichage est reformulé.
const INFINITE_METRICS = [
  { key: "distance", label: "Distance" },
  { key: "cells", label: "Cells" },
]
const INFINITE_CATEGORIES = [
  { key: "clean", label: "No" },
  { key: "assisted", label: "Yes" },
]

const source = ref("local")
const metric = ref("distance")
const category = ref("clean")

const {
  list: onlineList,
  status: onlineStatus,
  maxCount: onlineMaxCount,
  load: loadOnline,
} = useLeaderboard(
  computed(() => `${metric.value}:${category.value}`),
  // Lus au moment de load(), dans le même tick que la clé.
  () => fetchInfiniteLeaderboard(metric.value, category.value),
)

function setSource(value) {
  source.value = value
  if (value === "online" && onlineStatus.value === "idle") {
    loadOnline()
  }
}

function setMetric(value) {
  metric.value = value
  loadOnline()
}

function setCategory(value) {
  category.value = value
  loadOnline()
}

function onlineRowKey(row) {
  return `${row.username}-${row.submittedAt}`
}

const seedInput = ref("")

const isValidSeed = computed(
  () => seedInput.value !== "" && Number.isFinite(Number(seedInput.value)),
)

function submitSeed() {
  if (!isValidSeed.value) {
    return
  }

  emit("start-infinite-with-seed", Number(seedInput.value))
  seedInput.value = ""
}
</script>

<template>
  <section class="menu-page">
    <div class="menu-section-title">INFINITE RUNS</div>
    <!-- Local (runHistory.js, top perso sur cet appareil) vs Online
         (classement serveur, cf. infiniteOnline.js) — deux sources
         distinctes, jamais mélangées (même principe que LEGACY TIMES). -->
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

    <template v-if="source === 'local'">
      <template v-if="topRuns.length">
        <div class="sort-chips">
          <button
            v-for="criterion in visibleSortCriteria"
            :key="criterion.key"
            class="sort-chip"
            :class="{ active: sortKey === criterion.key }"
            @click="setSort(criterion.key)"
          >
            {{ criterion.label }}
            <span v-if="sortKey === criterion.key" class="sort-arrow">{{
              sortDir === "desc" ? "▼" : "▲"
            }}</span>
          </button>
        </div>
        <ol class="run-list">
          <li
            v-for="(run, i) in sortedRuns"
            :key="run.timestamp"
            class="run-row"
          >
            <div class="run-main">
              <span class="run-rank">#{{ i + 1 }}</span>
              <RunStatIcons
                :revealed-count="run.revealedCount"
                :distance="run.distance"
                :mines-triggered="run.minesTriggeredCount"
                :hearts-collected="run.heartsCollectedCount"
                :robots-triggered="run.robotsTriggeredCount"
              />
            </div>
            <div class="run-meta">
              {{ formatDateTime(run.timestamp) }} &middot; seed
              <span class="copyable">{{ run.seed }}</span>
            </div>
          </li>
        </ol>
      </template>
      <div v-else class="run-empty">No runs yet</div>
    </template>

    <template v-else>
      <!-- Metric (distance/cells) et category (clean/assisted) : deux
           groupes de chips séparés, même style que LEGACY TIMES. -->
      <div class="sort-chips">
        <button
          v-for="item in INFINITE_METRICS"
          :key="item.key"
          class="sort-chip"
          :class="{ active: metric === item.key }"
          @click="setMetric(item.key)"
        >
          {{ item.label }}
        </button>
      </div>
      <div class="settings-label">Machines used:</div>
      <div class="sort-chips">
        <button
          v-for="item in INFINITE_CATEGORIES"
          :key="item.key"
          class="sort-chip"
          :class="{ active: category === item.key }"
          @click="setCategory(item.key)"
        >
          {{ item.label }}
        </button>
      </div>

      <LeaderboardList
        :rows="onlineList"
        :status="onlineStatus"
        :pad-count="onlineMaxCount"
        :row-key="onlineRowKey"
        error-message="Couldn't load — tap a chip to retry"
      >
        <template #row="{ row, rank }">
          <div class="run-main">
            <span class="run-rank">#{{ rank }}</span>
            <span class="run-name" :title="row.username">{{
              row.username
            }}</span>
            <RunStatIcons
              :revealed-count="row.revealedCount"
              :distance="Math.round(row.maxDistance)"
              :mines-triggered="row.minesTriggered"
              :hearts-collected="row.heartsCollected"
              :robots-triggered="row.robotsTriggered"
            />
          </div>
          <div class="run-meta">{{ formatDate(row.submittedAt) }}</div>
        </template>
      </LeaderboardList>
    </template>

    <div class="menu-section-title">PLAY A SEED</div>
    <form class="seed-form" @submit.prevent="submitSeed">
      <label class="seed-label">
        Start infinite game with seed:
        <input
          v-model="seedInput"
          type="number"
          class="seed-input"
          :disabled="!infiniteUnlocked"
          placeholder="e.g. 172837465"
        />
      </label>
      <button
        type="submit"
        class="pixel-btn"
        :disabled="!infiniteUnlocked || !isValidSeed"
      >
        Start
      </button>
    </form>
  </section>
</template>

<style scoped>
.sort-arrow {
  font-size: 11px;
}
</style>
