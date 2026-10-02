# Backlog technique

Dette, bugs latents et refactorings repérés en codant autre chose. Un point
disparaît dans le commit qui le règle (l'historique git garde la trace).
`[serveur]` = dépôt `hibol-minesweeper-server`.

## Pairage d'appareil (chantier en cours, dans l'ordre)

- [ ] **[serveur] Limiter les tentatives sur `POST /api/legacy/players/link`** : aucun rate limit, un code à 6 chiffres se force (~60 % de chances par code actif à 1 000 req/s). Par IP, en lisant `X-Forwarded-For` derrière Caddy. Vérifier d'abord la config Caddy du VPS.
- [ ] **[serveur + front] Fusion ancienne identité → nouvelle** : `mergePlayers(from, to)` côté serveur (garde le meilleur score par ligne, supprime l'ancien joueur), appelée au pairage (champ optionnel `previousPlayerId`) et après un import de sauvegarde. Supprime les comptes orphelins, que l'utilisateur ne peut plus effacer lui-même. Réutilisable pour un futur login Google.
- [ ] **Avertissements** : à l'export (le fichier contient le compte en ligne, ne pas le partager) et au « Reset everything » (le compte en ligne sera abandonné ; proposer de le supprimer d'abord).

## Sécurité / robustesse serveur

- [ ] **[serveur] Rejeux Legacy non plafonnés** : `POST /api/legacy/submissions` lance un process Node par requête (jusqu'à 10 s), sans limite de concurrence (`ReplayService`). Quelques centaines de requêtes saturent le VPS partagé. Rate limit + sémaphore.
- [ ] **[serveur] Codes de pairage jamais purgés** : un code expiré mais jamais saisi reste en mémoire jusqu'au redémarrage (`PlayerLinkCodeService`). Purger les expirés dans `generate()`.

## APK

- [ ] **Événement `online` dans la WebView** : vérifier sur appareil qu'il se déclenche au retour du réseau. Sinon, relancer les trois files d'attente (Legacy, Infini, pseudo) quand l'app revient au premier plan.

## UI

- [ ] **LEGACY TIMES invisible pour un acheteur sans victoire** : la page (et son onglet Online) n'apparaît qu'en DEV ou avec un temps local (`legacyTimesVisible`, `BurgerMenu.vue`). Ajouter `legacyUnlocked` à la condition.

## Contrat front/back

- [ ] **[serveur] Routes d'identité sous `/api/legacy/players`** alors qu'elles servent à tous les modes. Renommer seulement avec une période où les deux routes coexistent (APK installés). Priorité basse.

## À garder en tête (pas d'action tant que rien ne change)

- **Génération Infini** : une partie restaurée recalcule `isMine`/`neighborMines` avec le code courant (`restoreInfiniteGame`). Si `isMineAt`/`densityAt`/`densityJitter` changent, versionner le snapshot ou garder l'ancienne formule.
- **Génération Legacy** : le serveur rejoue avec un seul moteur épinglé. Changer la génération du plateau Legacy fait refuser les victoires en attente et celles des APK pas à jour. Si ça arrive : `engineVersion` dans la soumission.
- **Achats in-app** : ne jamais rattacher un achat au seul `playerId` (il circule dans les sauvegardes), ni le garder seulement en local ; vérifier chaque achat côté serveur. Si un login est nécessaire (consommables, achats web + APK), il sort dans la même version que les achats.

## Docs / cosmétique

- [ ] **README front** : la section « Classement en ligne (Legacy) » ne couvre ni le classement Infini ni sa file d'attente, ni `accountOnline.js`/`onlineApi.js`.
- [ ] **[serveur] README, « Lien avec le front »** : mentionner `accountOnline.js` et `onlineApi.js`.
- [ ] **Commentaires périmés** : prop `devUnlocked` de `BurgerMenu.vue` (« Legacy derrière le bouton DEV »), `username.js` (anti-doublon « à venir », il existe).
- [ ] **`pendingUsernameClaim.test.js`** n'est pas au format Prettier.
- [ ] **Audit (artifact)** : section C obsolète sur le pairage. À rafraîchir à la fin du chantier pairage.
