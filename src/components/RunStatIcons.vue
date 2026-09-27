<script setup>
import { MINE_PIXELS, HEART_PIXELS, ROBOT_PIXELS } from "../icons"

// Icônes mines/hearts/robots d'une ligne de run — INFINITE RUNS local et
// online partagent exactement ce même triplet (cf. BurgerMenu.vue).
defineProps({
  minesTriggered: { type: Number, required: true },
  heartsCollected: { type: Number, default: 0 },
  robotsTriggered: { type: Number, default: 0 },
})
</script>

<template>
  <span class="run-stat">
    <svg viewBox="0 0 9 9" class="run-icon" shape-rendering="crispEdges">
      <rect
        v-for="(p, pi) in MINE_PIXELS"
        :key="pi"
        :x="p.x"
        :y="p.y"
        width="1"
        height="1"
        :fill="p.color"
      />
    </svg>
    {{ minesTriggered }}
  </span>
  <span v-if="heartsCollected" class="run-stat">
    <svg viewBox="0 0 9 9" class="run-icon" shape-rendering="crispEdges">
      <rect
        v-for="(p, pi) in HEART_PIXELS"
        :key="pi"
        :x="p.x"
        :y="p.y"
        width="1"
        height="1"
        :fill="p.color"
      />
    </svg>
    {{ heartsCollected }}
  </span>
  <span v-if="robotsTriggered" class="run-stat">
    <svg viewBox="0 0 9 9" class="run-icon" shape-rendering="crispEdges">
      <rect
        v-for="(p, pi) in ROBOT_PIXELS"
        :key="pi"
        :x="p.x"
        :y="p.y"
        width="1"
        height="1"
        :fill="p.color"
      />
    </svg>
    {{ robotsTriggered }}
  </span>
</template>
