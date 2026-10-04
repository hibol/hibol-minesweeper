<script setup>
import { ref, computed } from "vue"
import { HELP_PIXELS } from "../../icons"
import {
  theme,
  tapAction,
  longPressMs,
  MIN_LONG_PRESS_MS,
  MAX_LONG_PRESS_MS,
  showHelpButton,
  showCoordinates,
} from "../../state/settings"
import {
  hasFoundHeart,
  hasFoundRobot,
  hasFoundHibol,
} from "../../state/discoveries"
import { usernamePrompted } from "../../state/username"
import { treasureDayKey } from "../../state/treasureHunt"
import { requestLinkCode, deleteOnlineAccount } from "../../state/accountOnline"
import { buildExport, verifyAndParse } from "../../state/saveTransfer"
import { saveFile } from "../../exportFile"
import { useDeviceLink } from "../../composables/useDeviceLink"
import { DEVICE_LINKING } from "../../features"
import { formatClockTime } from "../../dateFormat"
import ConfirmDialog from "../ConfirmDialog.vue"

defineProps({
  infiniteUnlocked: Boolean,
})

const emit = defineEmits(["reset-everything", "import-save"])

// Pilote le remplissage façon "jauge" du slider 8-bit (cf. .settings-slider)
// — un <input type="range"> ne peut pas lire sa propre position en CSS pur,
// donc ce calcul vit côté JS et est poussé en custom property inline.
const longPressFillPercent = computed(
  () =>
    ((longPressMs.value - MIN_LONG_PRESS_MS) /
      (MAX_LONG_PRESS_MS - MIN_LONG_PRESS_MS)) *
    100,
)

// --- Backup : export d'un fichier JSON signé, import qui vérifie la
// signature avant de remplacer la sauvegarde (l'écriture + reload se font
// dans App.vue, cf. onImportSave, pour le teardown des listeners de
// persistance).
const importFileInput = ref(null)
const showImportConfirm = ref(false)
const pendingImportData = ref(null)
// Feedback inline (un toast s'afficherait derrière l'overlay du menu).
const backupError = ref("")

async function exportSave() {
  backupError.value = ""

  try {
    const payload = await buildExport()
    await saveFile({
      filename: `hibol-minesweeper-save-${treasureDayKey()}.json`,
      mimeType: "application/json",
      data: JSON.stringify(payload, null, 2),
    })
  } catch {
    backupError.value = "Export failed"
  }
}

function pickImportFile() {
  backupError.value = ""
  importFileInput.value?.click()
}

async function onImportFilePicked(event) {
  const file = event.target.files?.[0]
  // Vider tout de suite pour que re-choisir le MÊME fichier redéclenche change.
  event.target.value = ""

  if (!file) {
    return
  }

  const result = await verifyAndParse(await file.text())

  if (!result.ok) {
    backupError.value = `Import failed — ${result.error}`
    return
  }

  pendingImportData.value = result.data
  showImportConfirm.value = true
}

// L'identité de cet appareil fusionne dans celle du fichier (cf. App.vue
// onImportSave) : ses scores en ligne changent de nom, autant le dire.
const importConfirmMessage = computed(
  () =>
    "This replaces your current progress, settings and history." +
    (usernamePrompted.value
      ? " Online scores from this device move to the save's account."
      : ""),
)

function confirmImport() {
  showImportConfirm.value = false
  emit("import-save", pendingImportData.value)
  pendingImportData.value = null
}

// --- Lier cet appareil (Account, masqué en v0, cf. features.js) : deux flux
// indépendants pour rattacher plusieurs appareils à la même identité en
// ligne (cf. accountOnline.js requestLinkCode/completeDeviceLink). Succès =
// `reason` absent/null.
const linkCodeStatus = ref("idle") // idle | loading | ready | error
const linkCode = ref("")
const linkCodeExpiresAt = ref("")
const linkCodeError = ref("")

async function getLinkCode() {
  linkCodeStatus.value = "loading"
  linkCodeError.value = ""

  try {
    const result = await requestLinkCode()

    if (!result.reason) {
      linkCode.value = result.code
      linkCodeExpiresAt.value = result.expiresAt
      linkCodeStatus.value = "ready"
    } else {
      // unknown_player : la réclamation du pseudo à l'onboarding n'a pas
      // encore atteint le serveur (hors ligne, cf. pendingUsernameClaim.js).
      linkCodeError.value =
        result.reason === "unknown_player"
          ? "This device isn't registered online yet. Connect to the internet and try again."
          : "Couldn't get a code. Try again."
      linkCodeStatus.value = "error"
    }
  } catch {
    linkCodeError.value = "Couldn't reach the server. Try again."
    linkCodeStatus.value = "error"
  }
}

const {
  code: enterCodeInput,
  status: enterCodeStatus,
  error: enterCodeError,
  linkedUsername,
  submit: submitLinkCode,
} = useDeviceLink()

// --- Reset everything
const showResetConfirm = ref(false)
// Cochée : le compte en ligne est supprimé AVANT d'effacer le stockage —
// après, cet appareil n'aurait plus de quoi le désigner. Décochée (défaut) :
// le reset garde le compte en ligne (cf. storageReset.js).
const deleteOnlineOnReset = ref(false)
const resetError = ref("")

function openResetConfirm() {
  deleteOnlineOnReset.value = false
  resetError.value = ""
  showResetConfirm.value = true
}

async function confirmReset() {
  if (deleteOnlineOnReset.value) {
    try {
      await deleteOnlineAccount()
    } catch {
      showResetConfirm.value = false
      resetError.value =
        "Couldn't reach the server, so nothing was reset. Try again, or keep your online scores."
      return
    }
  }

  showResetConfirm.value = false
  emit("reset-everything", { keepOnlineAccount: !deleteOnlineOnReset.value })
}
</script>

<template>
  <section class="menu-page">
    <div class="menu-section-title">SETTINGS</div>

    <div class="settings-group">
      <div class="settings-label">Tap / left click:</div>
      <label class="settings-option">
        <input
          v-model="tapAction"
          type="radio"
          name="tap-action"
          value="reveal"
        />
        Reveal
      </label>
      <label class="settings-option">
        <input
          v-model="tapAction"
          type="radio"
          name="tap-action"
          value="flag"
        />
        Flag
      </label>
      <div class="settings-hint">Long-press does the opposite action</div>
    </div>

    <div class="settings-group">
      <div class="settings-label">Long-press duration: {{ longPressMs }}ms</div>
      <input
        v-model.number="longPressMs"
        type="range"
        class="settings-slider"
        :min="MIN_LONG_PRESS_MS"
        :max="MAX_LONG_PRESS_MS"
        step="50"
        :style="{ '--slider-fill': longPressFillPercent + '%' }"
      />
    </div>

    <div class="settings-group">
      <div class="settings-label">Style:</div>
      <label class="settings-option">
        <input v-model="theme" type="radio" name="theme" value="light" />
        Light
      </label>
      <label class="settings-option">
        <input v-model="theme" type="radio" name="theme" value="dark" />
        Dark
      </label>
    </div>

    <!-- N'a de sens que si le joueur a déjà croisé au moins une case
         spéciale — sinon les boutons "?" eux-mêmes ne sont visibles nulle
         part (gated sur les compteurs > 0 dans App.vue). Jalons de
         discoveries.js plutôt que les compteurs de la partie en cours : ils
         survivent d'une partie à l'autre. hasFoundHibol inclus : sinon un
         joueur 100 % chasse n'aurait jamais ce réglage. -->
    <div
      v-if="hasFoundHeart || hasFoundRobot || hasFoundHibol"
      class="settings-group"
    >
      <div class="settings-label">Help:</div>
      <label class="settings-checkbox">
        <input v-model="showHelpButton" type="checkbox" />
        Show
        <svg
          viewBox="0 0 9 9"
          class="settings-checkbox-icon"
          shape-rendering="crispEdges"
        >
          <rect
            v-for="(p, i) in HELP_PIXELS"
            :key="i"
            :x="p.x"
            :y="p.y"
            width="1"
            height="1"
            :fill="p.color"
          />
        </svg>
        buttons
      </label>
    </div>

    <!-- Le repère de position ne s'affiche qu'en Infini et en chasse :
         inutile de proposer le réglage tant que ces modes sont verrouillés. -->
    <div v-if="infiniteUnlocked" class="settings-group">
      <div class="settings-label">Infinite:</div>
      <label class="settings-checkbox">
        <input v-model="showCoordinates" type="checkbox" />
        Show position (x;y)
      </label>
    </div>

    <div class="settings-group">
      <div class="settings-label">Backup:</div>
      <div class="settings-actions">
        <button class="pixel-btn" @click="exportSave">Export</button>
        <button class="pixel-btn" @click="pickImportFile">Import</button>
      </div>
      <input
        ref="importFileInput"
        type="file"
        accept="application/json,.json"
        hidden
        @change="onImportFilePicked"
      />
      <div class="settings-hint">
        Moving to another device? Export here, then import the file there.
      </div>
      <div v-if="usernamePrompted" class="settings-hint">
        The file also holds your online account — keep it private.
      </div>
      <div v-if="backupError" class="settings-error">{{ backupError }}</div>
    </div>

    <!-- L'identité en ligne sert à tous les modes, dès l'onboarding.
         Groupe réservé au pairage, masqué en v0 (cf. features.js). -->
    <div v-if="DEVICE_LINKING && usernamePrompted" class="settings-group">
      <div class="settings-label">Account:</div>
      <div class="settings-hint">
        Link another device to this online identity.
      </div>

      <div class="settings-actions">
        <button class="pixel-btn" @click="getLinkCode">Get a code</button>
      </div>
      <div v-if="linkCodeStatus === 'ready'" class="settings-hint">
        Code: <strong class="copyable">{{ linkCode }}</strong> — expires at
        {{ formatClockTime(linkCodeExpiresAt) }}
      </div>
      <div v-if="linkCodeStatus === 'error'" class="settings-error">
        {{ linkCodeError }}
      </div>

      <form
        class="seed-form account-link-form"
        @submit.prevent="submitLinkCode"
      >
        <label class="seed-label">
          Enter a code from another device:
          <input
            v-model="enterCodeInput"
            type="text"
            inputmode="numeric"
            maxlength="6"
            class="seed-input"
            placeholder="123456"
          />
        </label>
        <button
          type="submit"
          class="pixel-btn"
          :disabled="enterCodeInput.length !== 6"
        >
          Link
        </button>
      </form>
      <div v-if="enterCodeStatus === 'success'" class="settings-hint">
        Linked — you're now playing as {{ linkedUsername }}.
      </div>
      <div v-if="enterCodeStatus === 'error'" class="settings-error">
        {{ enterCodeError }}
      </div>
    </div>

    <div class="settings-group">
      <div class="settings-label">Danger zone:</div>
      <button class="pixel-btn" @click="openResetConfirm">
        Reset everything
      </button>
      <div class="settings-hint">
        Erases all progress, settings and run history on this device
      </div>
      <div v-if="resetError" class="settings-error">{{ resetError }}</div>
    </div>

    <ConfirmDialog
      :show="showResetConfirm"
      title="RESET EVERYTHING?"
      message="All progress, settings and run history on this device will be erased."
      confirm-label="Reset"
      @cancel="showResetConfirm = false"
      @confirm="confirmReset"
    >
      <label v-if="usernamePrompted" class="settings-checkbox confirm-option">
        <input v-model="deleteOnlineOnReset" type="checkbox" />
        Also delete my online name and scores
      </label>
    </ConfirmDialog>

    <ConfirmDialog
      :show="showImportConfirm"
      title="IMPORT SAVE?"
      :message="importConfirmMessage"
      confirm-label="Import"
      @cancel="showImportConfirm = false"
      @confirm="confirmImport"
    />
  </section>
</template>

<style scoped>
.settings-group {
  margin-bottom: 18px;
}

.settings-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
}

/* Espace le formulaire "Enter a code" du bouton "Get a code" au-dessus, dans
   le même .settings-group (Account). */
.account-link-form {
  margin-top: 14px;
}

.settings-option {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0 10px;
  font-size: 15px;
  color: var(--color-text-strong);
  cursor: pointer;
}

.settings-option input[type="radio"] {
  appearance: none;
  width: 14px;
  height: 14px;
  margin: 0;
  border: 2px solid var(--color-chrome-border);
  background: var(--color-panel-bg);
  cursor: pointer;
}

.settings-option input[type="radio"]:checked {
  background: var(--color-chrome-border);
}

/* Case à cocher plutôt qu'une paire de radios : un simple on/off — même
   traitement visuel (carré, pas de coche native) que les radios ci-dessus. */
.settings-checkbox {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  color: var(--color-text-strong);
  cursor: pointer;
}

.settings-checkbox input[type="checkbox"] {
  appearance: none;
  flex-shrink: 0;
  width: 14px;
  height: 14px;
  margin: 0;
  border: 2px solid var(--color-chrome-border);
  background: var(--color-panel-bg);
  cursor: pointer;
}

.settings-checkbox-icon {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
}

.settings-checkbox input[type="checkbox"]:checked {
  background: var(--color-chrome-border);
}

/* Case du reset, dans le slot de ConfirmDialog : contenu de CE composant, donc
   ses styles scoped s'y appliquent. Après .settings-checkbox pour que la
   couleur du texte de la boîte de dialogue l'emporte. */
.confirm-option {
  margin-top: 12px;
  color: var(--color-text);
}

/* input[type=range] ne se restyle pas via une seule règle cross-navigateur
   (Chrome/Firefox exposent chaque partie via des pseudo-éléments préfixés
   différents) — d'où les blocs webkit et moz séparés. Le remplissage façon
   jauge (--slider-fill, cf. longPressFillPercent) reprend .danger-bar-fill
   d'App.vue : un dégradé net coupé à un pourcentage exact. Bordure, hauteur
   et fond alignés sur .danger-bar pour lire comme la même famille. */
.settings-slider {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 12px;
  margin: 6px 0;
  border: 1px solid var(--color-danger-bar-border);
  background: linear-gradient(
    to right,
    var(--color-danger-fill) var(--slider-fill),
    var(--color-danger-bar-bg) var(--slider-fill)
  );
  cursor: pointer;
}

.settings-slider::-webkit-slider-runnable-track {
  -webkit-appearance: none;
  background: transparent;
}

.settings-slider::-moz-range-track {
  background: transparent;
  border: none;
}

/* Bloc plein carré plutôt qu'un rond natif, comme les cases ci-dessus.
   Décalage vertical -4px = (piste 12px - thumb 20px) / 2 : Chrome ne centre
   pas le bloc une fois -webkit-appearance retiré, Firefox si. */
.settings-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 12px;
  height: 20px;
  margin-top: -4px;
  background: var(--color-chrome-border);
  border: 2px solid var(--color-border-soft);
  box-shadow: 2px 2px 0 var(--color-border-soft);
  cursor: pointer;
}

.settings-slider::-moz-range-thumb {
  width: 12px;
  height: 20px;
  border-radius: 0;
  background: var(--color-chrome-border);
  border: 2px solid var(--color-border-soft);
  box-shadow: 2px 2px 0 var(--color-border-soft);
  cursor: pointer;
}
</style>
