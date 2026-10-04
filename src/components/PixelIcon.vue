<script setup>
// Sprite pixel-art en SVG : viewBox tiré de la grille (pas toujours 9×9).
// Décoratif : le libellé accessible est porté par l'élément parent.
defineProps({
  pixels: { type: Array, required: true },
})
</script>

<template>
  <svg
    :viewBox="`0 0 ${pixels.width} ${pixels.height}`"
    shape-rendering="crispEdges"
    aria-hidden="true"
  >
    <rect
      v-for="(p, i) in pixels"
      :key="i"
      :x="p.x"
      :y="p.y"
      width="1"
      height="1"
      :fill="p.color"
    />
  </svg>
</template>
