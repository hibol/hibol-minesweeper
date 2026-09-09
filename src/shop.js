import { ref, computed } from 'vue'
import { chestReward, spendChestReward } from './treasureHunt'
import { unlockAchievement } from './achievements'

const INVENTORY_KEY = 'hibol-minesweeper:shop-inventory'

// Uniform price for now (1 hibol each). Tune per-item later if the economy
// needs it.
const MACHINE_COST = 1
const COSMETIC_COST = 3

// Static catalogue. `category` is structural, not just a visual tag (cf. the
// shop brainstorm): 'machine' items are one-use consumables usable in Infinite
// mode only; 'cosmetic' a one-shot unlock, then freely equip/swap in any mode
// (`slot` says which look it replaces, cf. cosmetics.js); 'mode' a costly
// one-shot unlock.
export const SHOP_ITEMS = [
  {
    id: 'windMachine',
    category: 'machine',
    name: 'Wind Machine',
    cost: MACHINE_COST,
    desc: 'Clears the darkness the mines have built up. One use.'
  },
  {
    id: 'travelMachine',
    category: 'machine',
    name: 'Travel Machine',
    cost: MACHINE_COST,
    desc: 'Drops you somewhere far off. Raw ground, no safety promise. One use.'
  },
  {
    id: 'xrayMachine',
    category: 'machine',
    name: 'X-Ray Machine',
    cost: MACHINE_COST,
    desc: 'Reveals the mines around a spot you pick. Safe cells stay hidden. One use.'
  },
  {
    id: 'legacyMode',
    category: 'mode',
    name: 'Legacy Mode',
    cost: 42,
    desc: 'Like the original: fixed boards, race the clock. Replaces Classic game. Permanent unlock.'
  },
  {
    id: 'mineDynamite',
    category: 'cosmetic',
    slot: 'mine',
    name: 'Dynamite',
    cost: COSMETIC_COST,
    desc: 'Mines look like a stick of dynamite.'
  },
  {
    id: 'mineBarrel',
    category: 'cosmetic',
    slot: 'mine',
    name: 'Powder Barrel',
    cost: COSMETIC_COST,
    desc: 'Mines look like a powder barrel.'
  },
  {
    id: 'flagSquare',
    category: 'cosmetic',
    slot: 'flag',
    name: 'Square Flag',
    cost: COSMETIC_COST,
    desc: 'A blunt rectangular flag.'
  },
  {
    id: 'flagSwallow',
    category: 'cosmetic',
    slot: 'flag',
    name: 'Swallowtail Flag',
    cost: COSMETIC_COST,
    desc: 'A forked pennant.'
  },
  {
    id: 'flagRound',
    category: 'cosmetic',
    slot: 'flag',
    name: 'Pennant Flag',
    cost: COSMETIC_COST,
    desc: 'A rounded pennant.'
  }
]

// Default (and shape reference) for the inventory: one counter per catalogue
// item, all at 0. Built from SHOP_ITEMS so a new item is picked up here for
// free.
function emptyInventory() {
  return Object.fromEntries(SHOP_ITEMS.map((item) => [item.id, 0]))
}

function loadInventory() {
  const counts = emptyInventory()

  try {
    const stored = JSON.parse(localStorage.getItem(INVENTORY_KEY))

    if (stored && typeof stored === 'object') {
      for (const id of Object.keys(counts)) {
        const n = Number(stored[id])

        if (Number.isFinite(n) && n > 0) {
          counts[id] = Math.floor(n)
        }
      }
    }
  } catch {
    // corrupt / unavailable localStorage: start with an empty inventory
  }

  return counts
}

// Shared singleton, same pattern as settings.js: any component that imports
// this reads/writes the same reactive state, no props/events plumbing.
export const inventory = ref(loadInventory())

function persistInventory() {
  try {
    localStorage.setItem(INVENTORY_KEY, JSON.stringify(inventory.value))
  } catch {
    // full / unavailable: the in-memory inventory still works for the session
  }
}

// Un achat de catégorie 'mode' est un déblocage définitif (compteur à 1, pas
// un consommable) — lu par App.vue pour afficher le bouton du mode.
export const legacyUnlocked = computed(() => (inventory.value.legacyMode ?? 0) > 0)

// The only writers of the inventory. buy() also spends the reward; it assumes
// nothing about the caller having checked the balance (the disabled Buy button
// is just UI) and returns false when it can't afford the item.
export function buy(itemId) {
  const item = SHOP_ITEMS.find((entry) => entry.id === itemId)

  if (!item || chestReward.value < item.cost) {
    return false
  }

  // Cosmétiques et déblocages de mode : one-shot, jamais rachetés (le bouton
  // passe à "Owned" / "Equip").
  if ((item.category === "mode" || item.category === "cosmetic") && inventory.value[itemId] > 0) {
    return false
  }

  spendChestReward(item.cost)
  inventory.value[itemId] = (inventory.value[itemId] ?? 0) + 1
  persistInventory()

  if (item.category === "machine") {
    unlockAchievement("machine-lover")

    const ownsEveryMachine = SHOP_ITEMS.filter((entry) => entry.category === "machine").every(
      (entry) => inventory.value[entry.id] > 0
    )

    if (ownsEveryMachine) {
      unlockAchievement("fully-equipped")
    }
  } else if (item.category === "cosmetic") {
    unlockAchievement("fashionista")
  }

  return true
}

// Spends one unit when a machine is used in-game (Phase B wiring in App.vue).
// Returns false when the player owns none.
export function consume(itemId) {
  if ((inventory.value[itemId] ?? 0) <= 0) {
    return false
  }

  inventory.value[itemId] -= 1
  persistInventory()
  return true
}
