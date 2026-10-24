# Backlog technique

Dette, bugs latents et refactorings repérés en codant autre chose. Un point
disparaît dans le commit qui le règle (l'historique git garde la trace).
`[serveur]` = dépôt `hibol-minesweeper-server`.

## Sécurité / robustesse serveur

- [ ] **[serveur] Réglages à poser sur le VPS** (le `docker-compose.yml` de prod n'est pas dans le dépôt) : `JAVA_TOOL_OPTIONS=-XX:MaxRAMPercentage=40` sur `minesweeper-server` (mesures dans le README, section Déploiement) ; `max_connections` de `minesweeper-db` vers 30 après vérification de `Max_used_connections` (détails dans `../hibol-minesweeper-server/CLAUDE.md`).
- [ ] **[serveur] Limite du login contournable en IPv6** (`LoginAttemptFilter.java`) : un attaquant change d'adresse dans son /64. → clé = préfixe /64 pour les adresses IPv6 (vaut aussi pour les autres `RateLimiter` par IP).
- [ ] **[serveur] Imitations de pseudos encore possibles** (`PlayerService.java:27`) : espace insécable U+00A0, caractères invisibles hors des catégories refusées (U+3164, U+2800), marques combinantes empilées, homoglyphes (« а » cyrillique). → normaliser en NFKC, refuser les espaces autres que U+0020, et à terme une comparaison par « squelette » (Unicode TR39) pour l'unicité.

## CI / livraison

- [ ] **[serveur] Tests d'intégration lents** : chaque classe démarre son propre MySQL (~13 s × 6) → conteneur partagé (`@TestConfiguration` avec un bean `@ServiceConnection`, ou classe de base).
- [ ] **[serveur] Classes de test fourre-tout** : `PlayerModerationTest` (318 lignes : modération, pseudo canonique, rendu des pages admin, lecture du pseudo) et `SecurityConfigTest` (251 lignes : CORS, login, logout, routes). → renommer ou découper (par exemple `PlayerIntegrationTest`, et une tranche `CorsTest`), en gardant un seul conteneur MySQL par classe. À faire avec le conteneur partagé ci-dessus.
- [ ] **[serveur] Requêtes en trop à chaque soumission** (`PlayerService.java:49`) : `touch()` + `save()` sur une entité détachée (sans open-in-view) = un SELECT et un UPDATE de plus. → requête `@Modifying` « UPDATE players SET last_active_at = :now WHERE player_id = :id ».

## APK

- [ ] **`aaptOptions` déprécié** (`android/app/build.gradle:45`, modèle Capacitor) → `androidResources { ignoreAssetsPattern … }`, seulement si AGP 9 le retire ou si Capacitor change son modèle.
- [ ] **Événement `online` dans la WebView** : vérifier sur appareil qu'il se déclenche au retour du réseau. Sinon, relancer les trois files d'attente (Legacy, Infini, pseudo) quand l'app revient au premier plan.
- [ ] **Import de sauvegarde : fichier peut-être grisé** (`menu/SettingsPage.vue:288`, `accept="application/json,.json"`) : un fichier enregistré via la feuille de partage (Drive, Fichiers) peut être vu en `application/octet-stream` et ne plus être sélectionnable. À vérifier sur le téléphone ; si c'est le cas, élargir ou retirer `accept` (la signature du fichier est de toute façon vérifiée à l'import).
- [ ] **Fichiers d'export jamais supprimés du cache** (`src/exportFile.js`) : un par seed pour les cartes, un par jour pour les sauvegardes. Android vide le cache s'il manque de place, donc peu grave. Ne pas les supprimer juste après le partage (l'app cible peut encore les lire) : plutôt vider ces fichiers au démarrage.
- [ ] **Appui long sur une ligne de run : presse-papiers dans la WebView** (`InfiniteRunRow.vue`, `navigator.clipboard.writeText`) : à vérifier sur appareil que « Seed copied » s'affiche et que le seed se colle dans PLAY A SEED. Pas de plugin `@capacitor/clipboard` sauf échec constaté. Priorité basse.
- [ ] **Push Infini au départ (`keepalive`) : preflight CORS** (`onlineApi.js`, `postJson`) : l'API est sur une autre origine et le corps est du JSON (preflight). À vérifier dans Chrome et la WebView qu'un `fetch` `keepalive` lancé sur `pagehide` / `visibilitychange` part bien (onglet réseau, ou log serveur). Priorité basse.
- [ ] **Avertissements Gradle** : le build signale des fonctionnalités dépréciées, incompatibles avec Gradle 9 → `./gradlew assembleDebug --warning-mode all` à examiner avant une montée de Gradle.

## UI

- [ ] **Case à cocher pixel en double** : même style recopié dans `menu/SettingsPage.vue` (`.settings-checkbox`) et `IntroDialog.vue` (`.intro-checkbox`) → une règle globale dans `style.css` pour la case elle-même, la mise en page restant locale.
- [ ] **Temps locaux avec l'ancien pseudo** (`legacyScores.js:74` et `:112`) : chaque temps local garde le pseudo du moment, donc après un renommage la liste mélange ancien et nouveau nom. → ne plus afficher ce nom dans la liste locale, ou afficher le pseudo actuel.
- [ ] **Petites retouches pseudo** : placeholder « up to 12 characters » en dur (`UsernameDialog.vue:133`) → le construire avec `MAX_USERNAME_LENGTH` ; `word-break: break-word` déprécié sur `.menu-username` (`BurgerMenu.vue:290`) → `overflow-wrap: anywhere`.
- [ ] **Voile : canvas réalloué et couleur relue à chaque dessin** (`usePixelFog.js:173` et `:181`) → ne redimensionner que si la taille change, garder `--fog-color` en cache par thème.
- [ ] **Toast et bannière de fin au même `z-index: 2`** (`ToastBanner`, `GameOverBanner`) : que le toast passe au-dessus dépend de l'ordre dans le DOM → un `z-index` explicitement plus haut pour le toast.
- [ ] **Export PNG : couleurs et légende à aligner sur la carte** (`mapRender.js`, `drawMapExport`) : l'export a sa propre table de couleurs (drapeau, mine, cœur, révélée) et ignore coffre, hibol, tornade et robot, que `cellMapColor` distingue. → le faire converger vers `cellMapColor` et `MAP_COLOR_VARS`. L'export n'a lieu qu'en fin de partie, donc pas de secret à garder : ajouter une couleur pour les cœurs non révélés. Ajouter aussi une légende, dans une zone de l'image non couverte par des cases révélées, ou à position fixe (bandeau en bas de l'image).
- [ ] **Clés de stockage des introductions encore dans App.vue** (`App.vue:84-86`, les trois `SEEN_*_KEY` ; `INFINITE_UNLOCKED_KEY` vit désormais dans `useEndOfGame.js`) : elles ne servent qu'à `useIntroDialog` (et la clé du déblocage de l'infini, au composable de fin de partie) → les déplacer avec le gestionnaire de modes, ou dans un petit module de clés partagé avec `storageReset.js`.
- [ ] **Easing et boucle de tween dupliqués** (`useOriginTween.js`, `useFogRadiusTween.js`) : `easeOutCubic` et la boucle `requestAnimationFrame` recopiés → un petit utilitaire commun.
- [ ] **Sprites encore recopiés à la main** : une vingtaine de `<svg>` + `v-for` de `<rect>` pourraient passer par `PixelIcon` quand on y touchera : `App.vue:1140`, `:1163`, `:1225`, `:1254`, `:1293`, `BurgerMenu.vue:86`, `menu/ShopPage.vue:70`, `:103`, `:128`, `:165`, `:202`, `menu/AchievementsPage.vue:52`, `menu/SettingsPage.vue:250`, `TreasureBanner.vue:38`. `MineCell.vue:59` aussi (7 copies), mais attention aux performances de la grille.
- [ ] **Largeur de la position liée à l'espacement des lettres** (`footer/PositionStat.vue:25`, `.stat-position`) : elle suppose le `letter-spacing: 1px` de `.stats-row` (`footer/footer.css:25`) sans que rien ne l'impose → une variable CSS `--stats-letter-spacing` utilisée aux deux endroits.
- [ ] **`GameOverBanner` : props sans `required`** (`GameOverBanner.vue:7`) : avec `revealedCount` ou `maxDistance` à `undefined`, la bannière afficherait « undefined » → `required: true`.
- [ ] **Distance en ligne arrondie dans la page** (`menu/InfiniteRunsPage.vue`, `onlineStats`) alors que la distance locale l'est déjà à l'enregistrement (`recordRun`) → arrondir une seule fois, en normalisant dans `infiniteOnline.js`.
- [ ] **Prix des skins en dur** (`menu/ShopPage.vue:124` et `:127`, `hibolBalance < 3` et « Buy · 3 ») alors que `shop.js` a `COSMETIC_COST` → lire `cost` de l'entrée `SHOP_ITEMS` du skin.
- [ ] **Reset avec suppression en ligne sans état « en cours »** (`menu/SettingsPage.vue:167`, `confirmReset`) : la confirmation reste ouverte et muette pendant le DELETE, un second tap le relance → bouton désactivé et libellé d'attente pendant l'appel.
- [ ] **`onGridTap` relit encore la position du conteneur** (`App.vue:841`, `getBoundingClientRect`) : sans gravité (une fois par tap) → exposer la position mémorisée par `useViewportCamera`.

## Moteur et robots

- [ ] **Mock incomplet dans `legacyOnline.test.js`** : le mock de `legacyPendingSubmissions` n'expose pas `clearPendingSubmission`, alors que `accountOnline.js` (réel dans ce test) l'importe. Ça passe parce que l'export n'est lu qu'à l'appel → ajouter l'export au mock.
- [ ] **`ImageData` absent de jsdom** (`test/setup.js`) : `MapCanvas.vue` couvert à 1 %, et un test qui passe en vue carte lève une erreur non interceptée au lieu d'échouer. → faux `ImageData` dans le setup.
- [ ] **Singletons qui fuient entre tests** (`test/appHarness.js`, `afterEach` des `src/App.*.integration.test.js`) : le helper remet à zéro l'inventaire, `treasureEntries` et `hibolBalance`, mais `usernamePrompted`, la chaîne de réclamation et `unlockedAchievements` le sont encore à la main dans chaque fichier → les ranger dans le helper, ou `vi.resetModules()` avec un import dynamique d'App.

## Contrat front/back

- [ ] **[serveur] Deux conventions pour « joueur inconnu »** : `GET /players/{id}/best` répond 200 avec `timeMs: null` (le front s'en sert avant la 1re soumission), `GET /players/{id}` répond 404. À garder, mais à documenter côte à côte dans le README.
- [ ] **[serveur] Routes d'identité sous `/api/legacy/players`** alors qu'elles servent à tous les modes. Renommer seulement avec une période où les deux routes coexistent (APK installés). Priorité basse.
- [ ] **Pairage : réclamation en attente non vidée** (`completeDeviceLink`, `accountOnline.js`) : après un onboarding hors ligne suivi d'un pairage depuis Settings, la réclamation du nom choisi partira pour le `playerId` lié. → `clearPendingClaim()` en cas de succès.
- [ ] **Pairage depuis Settings pendant que le dialogue de pseudo attend** (partie en cours) : l'état « à choisir » est bien effacé, mais les runs gardées ne repartent qu'au prochain démarrage ou retour du réseau → relancer les files après un pairage réussi (`retryOnlineQueues` est désormais dans `state/onlineQueues.js`, appelable de partout).
- [ ] **« Compte disparu » pour un très ancien joueur** (`accountOnline.js:191`) : un joueur qui a choisi son pseudo avant la réclamation à l'onboarding et n'a jamais rien soumis n'a pas de compte serveur ni de réclamation en attente → il verra « Your online account no longer exists ». Sans gravité (il peut retaper son nom). → un marqueur persisté « réclamation réussie au moins une fois ».
- [ ] **Victoire Legacy refusée en 503/429 retentée tard** : la file d'attente n'est relancée qu'au démarrage et sur l'événement `online` (`App.vue`, `useGamePersistence.js`). Une victoire refusée pour `replay_busy` attend le prochain lancement. Priorité basse : un retry différé (quelques minutes) suffirait.
- [ ] **Écritures `localStorage` restantes sans alerte** : `achievements.js` (watcher `unlockedAchievements`, `recordLegacyLoss`, `recordTreasureDayPlayed`), `username.js`, `playerId.js`, `settings.js`, `cosmetics.js`, `discoveries.js`, `seenFlag.js`, `useEndOfGame.js` (déblocage de l'Infini) et `useLegacyMode.js` n'ont pas été passées par `state/storageWrite.js` ; certaines lèvent même hors de tout `try/catch` quand le quota est plein. → les migrer vers `writeItem`/`writeJson`.

## Push du score Infini et lignes de runs unifiées (revue du commit 9053c14)

Niveaux : priorité haute = bug prouvé qui touche des joueurs ; moyenne = bug prouvé sans effet sur les données ; basse = risque plausible, remarque ou dette.

- [ ] **Priorité basse — `keepalive` pas garanti derrière le verrou de réclamation** (`accountOnline.js:62-80`, `withClaimLock`) : un push lancé sur `pagehide` attend la fin de toute réclamation en vol ; si la page est gelée avant, le `fetch` ne part jamais. → le documenter, ou court-circuiter le verrou quand le pseudo est déjà réclamé.
- [ ] **Priorité basse — Pas de repli après un 429 ou une panne** (`infiniteOnline.js`, `pushInfiniteProgress`) : `markPushed` n'avance pas, donc chaque palier, chaque départ et chaque ouverture du classement renvoie un POST (et chaque ouverture attend jusqu'à 3 s). → suspendre les pushes quelques minutes après un échec.
- [ ] **Priorité basse — Catégorie du front dérivée du seul `usedMachines`** (`infinitePendingSubmissions.js:25-27`, `game.js:1150-1153`) : le serveur classe aussi en assisted dès qu'un compteur est > 0, et la restauration n'impose pas « compteur > 0 ⇒ `usedMachines` ». Avec un snapshot altéré (compteur > 0, `usedMachines` faux), `markPushed` range les maxima assisted sous la clé clean. Le commentaire « même dérivation que le serveur » est inexact. → dériver aussi des compteurs dans `categoryOf`, ou utiliser `result.category` dans `markPushed`.
- [ ] **Priorité basse — Tests manquants sur le push** : pseudo refusé pendant un push (`username_taken`), 429, changement de catégorie en cours de run, `playerId` qui change pendant la requête (reproduit : sans effet, la fusion d'identité apporte les scores au nouveau compte).
- [ ] **Priorité basse — `visibilityState` jamais restauré en cas d'échec** (`App.online.integration.test.js:250` et `:269`) : `delete document.visibilityState` n'est ni dans un `afterEach` ni dans un `finally`, donc la propriété fuit vers les autres tests si l'assertion échoue avant.
- [ ] **Priorité basse — `useLongPress` : `fired` bloqué sur un `contextmenu` sans `pointerdown`** (`useLongPress.js:11`) : `fired` n'est remis à `false` qu'au `pointerdown`, donc un second `contextmenu` clavier est ignoré. Non testé. Aucun équivalent clavier pour copier le seed (ni `tabindex` ni rôle sur `InfiniteRunRow`). Test manquant aussi pour `navigator.clipboard` indéfini (le code le gère par le `catch`).
- [ ] **Priorité basse — Champs d'une run copiés à quatre endroits** (`runFromGame`, `runFromSnapshot`, le corps de `sendRun`, `sanitizeRun`) → une liste de champs commune.
- [ ] **Priorité basse — Ids de machines répétés à six endroits** (`MACHINE_IDS` de `game.js`, `MACHINE_PIXELS`, `SHOP_ITEMS`, `runFromGame`, `onlineMachineUses` de `InfiniteRunsPage.vue`, colonnes serveur) : ajouter une machine oblige à tous les toucher → dériver ce qui peut l'être de `SHOP_ITEMS`.
- [ ] **Priorité basse — Petits restes** : test redondant `live.status === "playing"` dans `currentRun` (`useInfiniteProgressPush.js`, déjà garanti par le `if` précédent) ; `SORT_CRITERIA` (`InfiniteRunsPage.vue`) mélange clés locales et `onlineMetric` ; README serveur, section classement Infini : « un appel par tableau affiché » alors que le front en fait deux pour la vue « tout ».

## À garder en tête (pas d'action tant que rien ne change)

- **Génération Infini** : une partie restaurée recalcule `isMine`/`neighborMines` avec le code courant (`restoreInfiniteGame`). Si `isMineAt`/`densityAt`/`densityJitter` changent, versionner le snapshot ou garder l'ancienne formule.
- **Renvoi Legacy** (`legacyOnline.js`, `retryPendingLegacySubmissions`) : réutilise `submitLegacyWin` volontairement. Son GET `/best` évite un rejeu serveur (le coût réel, 3 au plus par démarrage) pour une victoire qui n'améliore plus le classement ; une fonction d'envoi dédiée qui le sauterait ferait plus de rejeux, pas moins.
- **Génération Legacy** : le serveur rejoue avec un seul moteur épinglé. Changer la génération du plateau Legacy fait refuser les victoires en attente et celles des APK pas à jour. Si ça arrive : `engineVersion` dans la soumission.
- **`flatDir` dans `android/app/build.gradle:74`** : avertissement Gradle « Using flatDir should be avoided ». Bloc généré par Capacitor, à laisser tant que son modèle le contient.
- **Position du conteneur mémorisée** (`useViewportCamera.js:34`) : rafraîchie au redimensionnement et au défilement. Si le conteneur bouge sans changer de taille ni défiler (l'en-tête grandit pendant que le pied rétrécit d'autant), le point focal du zoom serait décalé → la rafraîchir au début de chaque pincement.
- **Pairage d'appareils masqué en v0** (`src/features.js`, `VITE_DEVICE_LINKING`) : il ne partageait que l'identité en ligne, pas la progression. Le code et les routes serveur restent. Le réactiver n'a de sens qu'avec une vraie synchronisation (sauvegarde côté serveur, conflits entre appareils, authentification, Data safety) : chantier à analyser si des joueurs le demandent. Ses textes restent dans le bundle livré (jamais affichés).
- **`UsernameDialog` monté avec `v-if`** : son commentaire le dit et c'est vrai depuis le lot du pseudo redemandé. Si quelqu'un repasse à `:show`, revoir l'initialisation du dialogue.
- **Plugin `@capacitor/share` (amont)** : quand `shareFiles` rejette (par exemple une URI hors du FileProvider), `share()` ouvre quand même le sélecteur. Pas concerné aujourd'hui (fichiers du cache, couverts par `file_paths.xml`), mais à savoir si on partage un jour un autre dossier.
- **Clés `v-for` des classements** (`${username}-${submittedAt}`) : un renommage entre deux chargements change la clé, sans conséquence aujourd'hui. Si le serveur exposait un identifiant public stable par ligne, l'utiliser.
- **Achats in-app** : ne jamais rattacher un achat au seul `playerId` (il circule dans les sauvegardes), ni le garder seulement en local ; vérifier chaque achat côté serveur. Si un login est nécessaire (consommables, achats web + APK), il sort dans la même version que les achats.

## Docs / cosmétique

- [ ] **Dépendances front** : correctifs en retard et vulnérabilités `npm audit` (outillage seulement au dernier examen, à revérifier depuis l'ajout de `@capacitor/filesystem` et `@capacitor/share`) → `npm update` + `npm audit fix`, tests et build relancés.
- [ ] **README front, `canGiveUp`** (ligne 71) : décrit le compteur brut, le code utilise `getEffectiveMines` (net des cœurs).
- [ ] **README front** : la section « Classement en ligne (Legacy) » ne couvre ni le classement Infini ni sa file d'attente, ni `accountOnline.js`/`onlineApi.js`.
- [ ] **[serveur] README, « Lien avec le front »** : mentionner `accountOnline.js` et `onlineApi.js`.
- [ ] **[serveur] Ligne de 146 caractères** (`SecurityConfigTest.java:89`, UUID dans un JSON en ligne) → extraire le corps dans une constante.
- [ ] **Commentaires périmés** : `username.js:4-8` et le commentaire de `generateRandomUsername` annoncent un anti-doublon « à venir » qui attribuerait d'office un `player####`, l'inverse de ce que fait l'app depuis que le pseudo refusé est redemandé → à réécrire.
