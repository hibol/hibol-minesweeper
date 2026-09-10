// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { webcrypto } from 'node:crypto'
import { buildExport, verifyAndParse, SAVE_FORMAT_VERSION } from './saveTransfer.js'

// jsdom fournit `localStorage` mais pas toujours `crypto.subtle` (WebCrypto),
// dont buildExport/verifyAndParse ont besoin pour l'HMAC-SHA256. Le WebCrypto
// global de Node implémente la même spec → on l'expose si absent. Ce n'est
// pas un mock de comportement : même algo, même résultat.
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })
}

const PREFIX = 'hibol-minesweeper:'

describe('saveTransfer — export / import', () => {
  beforeEach(() => {
    // Quelques clés du jeu + une clé étrangère qui NE doit PAS être exportée.
    localStorage.setItem(`${PREFIX}username`, 'hibol')
    localStorage.setItem(`${PREFIX}chest-reward`, '3')
    localStorage.setItem(`${PREFIX}theme`, 'dark')
    localStorage.setItem('some-other-app:token', 'ignore-me')
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('round-trip : buildExport → verifyAndParse → { ok: true } avec les mêmes données', async () => {
    const exported = await buildExport()

    expect(exported.app).toBe('hibol-minesweeper')
    expect(exported.version).toBe(SAVE_FORMAT_VERSION)
    // Seules les clés préfixées sont embarquées.
    expect(exported.data).toEqual({
      [`${PREFIX}username`]: 'hibol',
      [`${PREFIX}chest-reward`]: '3',
      [`${PREFIX}theme`]: 'dark',
    })

    const result = await verifyAndParse(JSON.stringify(exported))
    expect(result).toEqual({ ok: true, data: exported.data })
  })

  it('rejette un fichier altéré → { ok: false, error: "save file has been modified" }', async () => {
    const exported = await buildExport()
    exported.data[`${PREFIX}chest-reward`] = '99999' // triche

    const result = await verifyAndParse(JSON.stringify(exported))

    expect(result.ok).toBe(false)
    expect(result.error).toBe('save file has been modified')
  })

  it('rejette une version plus récente que SAVE_FORMAT_VERSION', async () => {
    const exported = await buildExport()
    exported.version = SAVE_FORMAT_VERSION + 1

    const result = await verifyAndParse(JSON.stringify(exported))

    expect(result.ok).toBe(false)
    expect(result.error).toBe('save is from a newer version of the game')
  })

  describe('rejette un fichier malformé', () => {
    it('JSON syntaxiquement cassé', async () => {
      const result = await verifyAndParse('{ cassé')
      expect(result).toEqual({ ok: false, error: 'not a valid file' })
    })

    it('pas un objet JSON', async () => {
      const result = await verifyAndParse('42')
      expect(result).toEqual({ ok: false, error: 'not a hibol minesweeper save' })
    })

    it('mauvais champ `app`', async () => {
      const text = JSON.stringify({ app: 'not-minesweeper', version: 1, data: {}, sig: 'x' })
      const result = await verifyAndParse(text)
      expect(result).toEqual({ ok: false, error: 'not a hibol minesweeper save' })
    })

    it('`data` absent → fichier incomplet', async () => {
      const text = JSON.stringify({ app: 'hibol-minesweeper', version: 1 })
      const result = await verifyAndParse(text)
      expect(result).toEqual({ ok: false, error: 'save file is incomplete' })
    })

    it('valeur de `data` non-string', async () => {
      const text = JSON.stringify({
        app: 'hibol-minesweeper',
        version: 1,
        data: { [`${PREFIX}x`]: 5 },
        sig: 'deadbeef',
      })
      const result = await verifyAndParse(text)
      expect(result).toEqual({ ok: false, error: 'save file is malformed' })
    })

    it('clé de `data` hors préfixe', async () => {
      const text = JSON.stringify({
        app: 'hibol-minesweeper',
        version: 1,
        data: { 'evil:key': 'v' },
        sig: 'deadbeef',
      })
      const result = await verifyAndParse(text)
      expect(result).toEqual({ ok: false, error: 'save file is malformed' })
    })
  })
})
