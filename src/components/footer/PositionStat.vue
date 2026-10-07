<script setup>
// Repère de position (« x,y(12;-10) »), opt-in dans Settings.
defineProps({
  label: { type: String, required: true },
  description: { type: String, required: true },
})
</script>

<template>
  <span
    class="stat stat-position"
    role="img"
    :aria-label="description"
    :title="description"
    >{{ label }}</span
  >
</template>

<style scoped src="./stat.css"></style>
<style scoped>
/* Largeur fixe, taillée pour « x,y(-9999;-9999) » (16 car. + 1px
   d'espacement chacun) : sinon un caractère de plus peut faire passer la
   ligne sur deux, rapetisser la zone de jeu, décaler la case centrale et
   donc la position affichée — qui revient, et la ligne oscille. */
.stat-position {
  flex-shrink: 0;
  justify-content: center;
  width: calc(16 * (1ch + 1px));
  white-space: nowrap;
}
</style>
