# hibol-minesweeper (front)

## À régler en phase de test

- **Pool de connexions / `max_connections` MySQL (côté serveur)** : le serveur `hibol-minesweeper-server` n'a pas de `maximum-pool-size` configuré (défaut HikariCP : 10), et le `max_connections` de la base MySQL liée reste à fixer. À traiter au passage en phase de test, surtout si des tests de charge partent de ce front. Détails dans `../hibol-minesweeper-server/CLAUDE.md`.
