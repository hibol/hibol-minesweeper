<script setup>
// Classement à hauteur fixe : toujours `padCount` lignes, celles qui manquent
// restent invisibles, pour que le panneau garde sa taille d'un chip à
// l'autre. Le contenu d'une ligne réelle vient du slot `row` ({ row, rank }).
const props = defineProps({
  rows: { type: Array, required: true },
  // Liste locale : toujours "loaded".
  status: { type: String, default: "loaded" }, // idle | loading | loaded | error
  padCount: { type: Number, required: true },
  rowKey: { type: Function, required: true },
  errorMessage: { type: String, default: "" },
})

// Ligne affichée au rang i (1-based), seulement une fois la liste chargée.
function shownRow(i) {
  return props.status === "loaded" ? props.rows[i - 1] : undefined
}
</script>

<template>
  <ol v-if="padCount" class="run-list">
    <!-- La 1re ligne reste visible : elle porte l'état (chargement, erreur,
         liste vide) quand il n'y a pas de ligne à montrer. -->
    <li
      v-for="i in padCount"
      :key="shownRow(i) ? rowKey(shownRow(i)) : `pad-${i}`"
      class="run-row"
      :class="{ 'run-row-pad': !shownRow(i) && i !== 1 }"
    >
      <template v-if="i === 1 && status === 'loading'">
        <div class="run-main">Loading…</div>
        <div class="run-meta">&nbsp;</div>
      </template>
      <template v-else-if="i === 1 && status === 'error'">
        <div class="run-main">{{ errorMessage }}</div>
        <div class="run-meta">&nbsp;</div>
      </template>
      <slot v-else-if="shownRow(i)" name="row" :row="shownRow(i)" :rank="i" />
      <template v-else-if="i === 1 && status === 'loaded'">
        <div class="run-main">No times yet</div>
        <div class="run-meta">&nbsp;</div>
      </template>
      <template v-else>
        <div class="run-main">&nbsp;</div>
        <div class="run-meta">&nbsp;</div>
      </template>
    </li>
  </ol>
  <div v-else-if="status === 'loading'" class="run-empty">Loading…</div>
  <div v-else-if="status === 'error'" class="run-empty">
    {{ errorMessage }}
  </div>
  <div v-else class="run-empty">No times yet</div>
</template>
