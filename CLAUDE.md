# hibol-minesweeper (front)

## À régler en phase de test

- **Pool de connexions / `max_connections` MySQL (côté serveur)** : le serveur `hibol-minesweeper-server` n'a pas de `maximum-pool-size` configuré (défaut HikariCP : 10), et le `max_connections` de la base MySQL liée reste à fixer. À traiter au passage en phase de test, surtout si des tests de charge partent de ce front. Détails dans `../hibol-minesweeper-server/CLAUDE.md`.

## Tests

- **Couverture lancée par un agent** : Vitest 5 détecte les agents IA (variables `CLAUDECODE`, `AI_AGENT`) et masque alors les fichiers couverts à 100 % du rapport `text`. Pour obtenir le même rapport que dans un terminal : `env -u CLAUDECODE -u AI_AGENT npx vitest run --coverage --coverage.reporter=text`.
- **Réseau coupé par défaut** : `test/setup.js` remplace `fetch` par un rejet en jsdom (monter l'App lance des requêtes au boot, qui partaient sinon sur le vrai serveur). Un test qui veut une réponse stubbe `fetch` (`vi.stubGlobal`) ; le harness (`useAppHarness`) revient au défaut coupé après chaque test.
