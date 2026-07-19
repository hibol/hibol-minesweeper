<script setup>
import { ref } from 'vue'
import { MENU_PIXELS } from '../icons'
import { loadTopRuns } from '../runHistory'

const isOpen = ref(false)
const topRuns = ref([])

function toggleMenu() {
  isOpen.value = !isOpen.value

  if (isOpen.value) {
    topRuns.value = loadTopRuns()
  }
}

function formatDate(timestamp) {
  return new Date(timestamp).toLocaleDateString()
}
</script>

<template>
  <div class="burger-menu">
    <button class="menu-btn" @click="toggleMenu" aria-label="Menu">
      <svg viewBox="0 0 9 9" class="menu-icon" shape-rendering="crispEdges">
        <rect v-for="(p, i) in MENU_PIXELS" :key="i" :x="p.x" :y="p.y" width="1" height="1" :fill="p.color" />
      </svg>
    </button>

    <div v-if="isOpen" class="menu-panel">
      <div class="menu-panel-title">TOP RUNS</div>
      <ol v-if="topRuns.length" class="run-list">
        <li v-for="(run, i) in topRuns" :key="run.timestamp" class="run-row">
          <span class="run-rank">#{{ i + 1 }}</span>
          <span class="run-cells">{{ run.revealedCount }} cells</span>
          <span class="run-distance">{{ run.distance }} dist</span>
          <span class="run-mines">{{ run.minesTriggeredCount }} mines</span>
          <span class="run-date">{{ formatDate(run.timestamp) }}</span>
        </li>
      </ol>
      <div v-else class="run-empty">No runs yet</div>
    </div>
  </div>
</template>

<style scoped>
.burger-menu {
  position: relative;
}

.menu-btn {
  background: #eee;
  border: 2px solid #333;
  box-shadow: 2px 2px 0 #999;
  padding: 6px;
  cursor: pointer;
  display: flex;
}

.menu-icon {
  width: 16px;
  height: 16px;
  display: block;
}

.menu-panel {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 3;
  background: #eee;
  border: 2px solid #333;
  box-shadow: 4px 4px 0 #999;
  padding: 10px 12px;
  min-width: 260px;
  font-family: 'VT323', monospace;
}

.menu-panel-title {
  font-family: 'Press Start 2P', monospace;
  font-size: 13px;
  color: #222;
  margin-bottom: 8px;
}

.run-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.run-row {
  display: flex;
  gap: 8px;
  padding: 4px 0;
  border-bottom: 1px solid #ccc;
  font-size: 14px;
  color: #333;
  white-space: nowrap;
}

.run-row:last-child {
  border-bottom: none;
}

.run-rank {
  color: #222;
  font-weight: bold;
}

.run-date {
  margin-left: auto;
  color: #666;
}

.run-empty {
  font-size: 14px;
  color: #666;
}
</style>
