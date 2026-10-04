<script setup>
import { ref, computed, useId, watch, nextTick } from "vue"
import { MAX_USERNAME_LENGTH, generateRandomUsername } from "../state/username"
import { claimUsername } from "../state/accountOnline"
import { useModalA11y } from "../composables/useModalA11y"
import { useDeviceLink } from "../composables/useDeviceLink"
import { DEVICE_LINKING } from "../features"

const props = defineProps({
  show: Boolean,
  // Variante « nouveau pseudo » (cf. usernameChoice.js) : { reason,
  // rejectedName }, figée par App.vue à l'ouverture. null à l'onboarding.
  retry: { type: Object, default: null },
})

// Émis au dernier bouton. Le pseudo est déjà enregistré par claimUsername ou
// completeDeviceLink (cf. accountOnline.js) : rien à transmettre.
const emit = defineEmits(["submit"])

// Plusieurs temps dans le même dialog plutôt que plusieurs composants : saisie
// du nom (ou pairage avec un autre appareil), puis phrase d'accueil. Le
// composant est monté via v-if côté App.vue, donc cet état interne repart de
// zéro à chaque affichage.

const retryMessage = computed(() => {
  if (props.retry?.reason === "taken") {
    return `"${props.retry.rejectedName}" is already taken online — pick another name.`
  }
  if (props.retry?.reason === "account_gone") {
    return "Your online account no longer exists — choose a name to appear online again."
  }
  return ""
})
const step = ref("input") // 'input' | 'link' | 'welcome'
const name = ref("")
const chosenName = ref("")
const claiming = ref(false)
const claimError = ref("")

// Réclame le pseudo au serveur avant de continuer (cf. accountOnline.js
// claimUsername) plutôt que d'attendre la 1re victoire Legacy soumise — le
// joueur sait tout de suite si son nom est pris. Hors ligne/timeout :
// claimUsername met la réclamation en attente et renvoie `null`, on continue
// quand même avec le nom choisi localement (esprit hors-ligne-d'abord).
async function goToWelcome() {
  if (claiming.value) {
    return
  }

  // Champ laissé vide -> nom aléatoire "player####" plutôt que rien : le menu
  // affiche toujours un pseudo.
  const typed = name.value.trim().slice(0, MAX_USERNAME_LENGTH)
  const candidate = typed || generateRandomUsername()

  claiming.value = true
  claimError.value = ""
  const result = await claimUsername(candidate)
  claiming.value = false

  if (result === null) {
    chosenName.value = candidate
    step.value = "welcome"
    return
  }

  if (result.reason) {
    claimError.value =
      result.reason === "username_taken"
        ? DEVICE_LINKING
          ? "that name's taken — if it's yours, link this device"
          : "that name's taken, try another"
        : "that name isn't valid, try another"
    return
  }

  // Nom renvoyé par le serveur, pas forcément celui tapé (trim côté serveur).
  chosenName.value = result.username
  step.value = "welcome"
}

// Joueur qui revient sur un nouvel appareil : il adopte son identité existante
// au lieu d'en réclamer une nouvelle, qui resterait orpheline sur le serveur.
const {
  code: linkCode,
  status: linkStatus,
  error: linkError,
  linkedUsername,
  submit: submitLink,
} = useDeviceLink()

async function linkThisDevice() {
  await submitLink()

  if (linkStatus.value === "success") {
    chosenName.value = linkedUsername.value
    step.value = "welcome"
  }
}

function finish() {
  emit("submit")
}

// Ton "attract-mode" arcade, aligné sur le reste de la copie du jeu (titres
// en Press Start 2P, formules sèches "Beware of the fog of war").
// chosenName est toujours renseigné à ce stade (saisi ou tiré au sort).
// Variante retry : le joueur est déjà en jeu, on confirme juste le nom.
const welcomeTitle = computed(() => {
  const name = chosenName.value.toUpperCase()
  if (linkStatus.value === "success") {
    return `WELCOME BACK, ${name}`
  }
  return props.retry ? `YOU'RE NOW ${name}` : `WELCOME, ${name}`
})

const welcomeMessage = computed(() =>
  props.retry
    ? "Your scores will be sent under this name."
    : "The minefield is waiting. Good luck.",
)

// Pas d'onClose : l'invite de pseudo n'a pas de "Cancel", Échap n'a nulle part
// où aller. On garde le piège à focus + le focus-in / labelledby.
const box = ref(null)
const titleId = useId()
useModalA11y(() => props.show, box)

// useModalA11y ne place le focus qu'à l'ouverture : à chaque changement
// d'écran, l'élément focalisé disparaît, on le replace sur le nouvel écran.
watch(step, async () => {
  await nextTick()
  box.value?.querySelector("input, button")?.focus()
})
</script>

<template>
  <div v-if="show" class="username-overlay">
    <div
      ref="box"
      class="username-box"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="titleId"
      tabindex="-1"
    >
      <template v-if="step === 'input'">
        <div :id="titleId" class="username-title">ENTER YOUR NAME</div>
        <div v-if="retryMessage" class="username-sub">{{ retryMessage }}</div>
        <input
          v-model="name"
          class="username-input"
          type="text"
          :maxlength="MAX_USERNAME_LENGTH"
          :disabled="claiming"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          placeholder="up to 12 characters"
          @input="claimError = ''"
          @keydown.enter="goToWelcome"
        />
        <div class="username-actions">
          <button class="pixel-btn" :disabled="claiming" @click="goToWelcome">
            {{ claiming ? "..." : "Continue" }}
          </button>
        </div>
        <div v-if="claimError" class="username-error">{{ claimError }}</div>
        <div v-else class="username-hint">leave blank for a random name</div>
        <button
          v-if="DEVICE_LINKING"
          type="button"
          class="username-link"
          :disabled="claiming"
          @click="step = 'link'"
        >
          Already playing on another device?
        </button>
      </template>

      <template v-else-if="DEVICE_LINKING && step === 'link'">
        <div :id="titleId" class="username-title">LINK THIS DEVICE</div>
        <div class="username-sub">
          On your other device: Settings → Account → Get a code.
        </div>
        <form @submit.prevent="linkThisDevice">
          <input
            v-model="linkCode"
            class="username-input"
            type="text"
            inputmode="numeric"
            maxlength="6"
            autocomplete="off"
            placeholder="123456"
            :disabled="linkStatus === 'loading'"
          />
          <div class="username-actions">
            <button type="button" class="pixel-btn" @click="step = 'input'">
              Back
            </button>
            <button
              type="submit"
              class="pixel-btn"
              :disabled="linkCode.length !== 6 || linkStatus === 'loading'"
            >
              {{ linkStatus === "loading" ? "..." : "Link" }}
            </button>
          </div>
        </form>
        <div v-if="linkStatus === 'error'" class="username-error">
          {{ linkError }}
        </div>
      </template>

      <template v-else>
        <div :id="titleId" class="username-title">{{ welcomeTitle }}</div>
        <div class="username-sub">{{ welcomeMessage }}</div>
        <div class="username-actions">
          <button class="pixel-btn" @click="finish">
            {{ retry ? "OK" : "PRESS START" }}
          </button>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
/* Repris de IntroDialog.vue : même famille visuelle que les autres popups. */
.username-overlay {
  position: fixed;
  inset: 0;
  z-index: 10;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
}

.username-box {
  background: var(--color-panel-bg);
  border: 2px solid var(--color-chrome-border);
  box-shadow: 4px 4px 0 var(--color-border-soft);
  padding: 20px 24px;
  max-width: 320px;
  text-align: center;
  font-family: "VT323", monospace;
}

.username-title {
  font-family: "Press Start 2P", monospace;
  font-size: 13px;
  color: var(--color-text-strong);
  line-height: 1.6;
  /* WELCOME BACK après un pairage : le nom peut faire 32 caractères. */
  overflow-wrap: anywhere;
}

.username-sub {
  margin-top: 12px;
  font-size: 16px;
  color: var(--color-text);
}

/* Aligné sur .seed-input dans BurgerMenu.vue. */
.username-input {
  margin-top: 16px;
  font-family: "VT323", monospace;
  font-size: 16px;
  width: 180px;
  padding: 4px 8px;
  background: var(--color-cell-unrevealed-bg);
  border: 2px solid var(--color-chrome-border);
  color: var(--color-text-strong);
  text-align: center;
}

.username-actions {
  margin-top: 16px;
  display: flex;
  justify-content: center;
  gap: 8px;
}

/* Action secondaire : un lien plutôt qu'un 2e bouton pixel. */
.username-link {
  margin-top: 12px;
  background: none;
  border: none;
  padding: 0;
  font-family: "VT323", monospace;
  font-size: 14px;
  color: var(--color-text);
  text-decoration: underline;
  cursor: pointer;
}

.username-link:disabled {
  opacity: 0.5;
  cursor: default;
}

.username-hint {
  margin-top: 10px;
  font-size: 13px;
  color: var(--color-text);
  opacity: 0.7;
}

/* Même style que .settings-error dans BurgerMenu.vue. */
.username-error {
  margin-top: 10px;
  font-size: 13px;
  color: var(--color-danger-fill);
}
</style>
