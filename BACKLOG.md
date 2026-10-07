# Backlog technique

Dette, bugs latents et refactorings repérés en codant autre chose. Un point
disparaît dans le commit qui le règle (l'historique git garde la trace).
`[serveur]` = dépôt `hibol-minesweeper-server`.

## Sécurité / robustesse serveur

- [ ] **[serveur] Conteneur en root** : pas de `USER` dans l'étage final du `Dockerfile`.
- [ ] **[serveur] Limite du login contournable en IPv6** (`LoginAttemptFilter.java`) : un attaquant change d'adresse dans son /64. → clé = préfixe /64 pour les adresses IPv6 (vaut aussi pour les autres `RateLimiter` par IP).
- [ ] **[serveur] `/merge` d'un joueur vers lui-même en changeant la casse** (`PlayerMergeService.java:43`) : `equals` tient compte de la casse, la colonne `player_id` non. Un merge de « AAAA… » vers « aaaa… » supprime le joueur et tous ses scores (il faut connaître son propre `playerId` : auto-sabotage, mais bug). → `equalsIgnoreCase`, ou n'accepter que des UUID en minuscules dans `PlayerIds`.
- [ ] **[serveur] Imitations de pseudos encore possibles** (`PlayerService.java:27`) : espace insécable U+00A0, caractères invisibles hors des catégories refusées (U+3164, U+2800), marques combinantes empilées, homoglyphes (« а » cyrillique). → normaliser en NFKC, refuser les espaces autres que U+0020, et à terme une comparaison par « squelette » (Unicode TR39) pour l'unicité.

## CI / livraison

- [ ] **CI front** : `ci.yml` ne lance pas `npm run build` (une PR qui casse le build n'est vue qu'au déploiement) et n'a pas de bloc `permissions: contents: read` ; `deploy.yml` n'a pas `cache: npm` sur `setup-node`.
- [ ] **[serveur] Déploiement** : pas de `concurrency` sur le job de déploiement (deux pushes rapprochés peuvent finir sur l'image `latest` la plus ancienne) ; clé SSH non supprimée si `ssh` échoue (`trap 'rm -f /tmp/deploy_key' EXIT`) ; `known_hosts` figé sur l'IP du VPS en dur (`deploy.yml:75-82`) alors que l'hôte vient d'un secret → la ligne `known_hosts` dans un secret ; actions à monter ensemble (`docker/build-push-action` v5 → v6) ; `mvnw` versionné sans bit exécutable (`git update-index --chmod=+x mvnw`).
- [ ] **[serveur] Tests d'intégration lents** : chaque classe démarre son propre MySQL (~13 s × 6) → conteneur partagé (`@TestConfiguration` avec un bean `@ServiceConnection`, ou classe de base) ; figer le tag `mysql:8` sur la version mineure de prod.
- [ ] **[serveur] Classes de test fourre-tout** : `PlayerModerationTest` (318 lignes : modération, pseudo canonique, rendu des pages admin, lecture du pseudo) et `SecurityConfigTest` (251 lignes : CORS, login, logout, routes). → renommer ou découper (par exemple `PlayerIntegrationTest`, et une tranche `CorsTest`), en gardant un seul conteneur MySQL par classe. À faire avec le conteneur partagé ci-dessus.
- [ ] **[serveur] Requêtes en trop à chaque soumission** (`PlayerService.java:49`) : `touch()` + `save()` sur une entité détachée (sans open-in-view) = un SELECT et un UPDATE de plus. → requête `@Modifying` « UPDATE players SET last_active_at = :now WHERE player_id = :id ».

## APK

- [ ] **`aaptOptions` déprécié** (`android/app/build.gradle:45`, modèle Capacitor) → `androidResources { ignoreAssetsPattern … }`, seulement si AGP 9 le retire ou si Capacitor change son modèle.
- [ ] **Événement `online` dans la WebView** : vérifier sur appareil qu'il se déclenche au retour du réseau. Sinon, relancer les trois files d'attente (Legacy, Infini, pseudo) quand l'app revient au premier plan.
- [ ] **Import de sauvegarde : fichier peut-être grisé** (`menu/SettingsPage.vue:288`, `accept="application/json,.json"`) : un fichier enregistré via la feuille de partage (Drive, Fichiers) peut être vu en `application/octet-stream` et ne plus être sélectionnable. À vérifier sur le téléphone ; si c'est le cas, élargir ou retirer `accept` (la signature du fichier est de toute façon vérifiée à l'import).
- [ ] **Fichiers d'export jamais supprimés du cache** (`src/exportFile.js`) : un par seed pour les cartes, un par jour pour les sauvegardes. Android vide le cache s'il manque de place, donc peu grave. Ne pas les supprimer juste après le partage (l'app cible peut encore les lire) : plutôt vider ces fichiers au démarrage.
- [ ] **Avertissements Gradle** : le build signale des fonctionnalités dépréciées, incompatibles avec Gradle 9 → `./gradlew assembleDebug --warning-mode all` à examiner avant une montée de Gradle.

## UI

- [ ] **Case à cocher pixel en double** : même style recopié dans `menu/SettingsPage.vue` (`.settings-checkbox`) et `IntroDialog.vue` (`.intro-checkbox`) → une règle globale dans `style.css` pour la case elle-même, la mise en page restant locale.
- [ ] **LEGACY TIMES invisible pour un acheteur sans victoire** : la page (et son onglet Online) n'apparaît qu'avec au moins un temps local (`legacyTimesVisible = hasAnyLegacyScore()`, `BurgerMenu.vue`). Ajouter `legacyUnlocked` à la condition.
- [ ] **Temps locaux avec l'ancien pseudo** (`legacyScores.js:74` et `:112`) : chaque temps local garde le pseudo du moment, donc après un renommage la liste mélange ancien et nouveau nom. → ne plus afficher ce nom dans la liste locale, ou afficher le pseudo actuel.
- [ ] **Petites retouches pseudo** : placeholder « up to 12 characters » en dur (`UsernameDialog.vue:133`) → le construire avec `MAX_USERNAME_LENGTH` ; `word-break: break-word` déprécié sur `.menu-username` (`BurgerMenu.vue:290`) → `overflow-wrap: anywhere`.
- [ ] **Position de caméra restaurée sans validation** (`App.vue:877` et `:1417`) : `originX`/`originY` sont réappliqués tels quels, un NaN casse la caméra comme le faisait `cellSize`. → étendre `restoredCellSize` en `restoredCamera(camera, base)`.
- [ ] **Voile : canvas réalloué et couleur relue à chaque dessin** (`usePixelFog.js:173` et `:181`) → ne redimensionner que si la taille change, garder `--fog-color` en cache par thème.
- [ ] **Toasts d'erreur trop courts par défaut** (`toastQueue.js:3`, 1000 ms) : chaque appel doit penser à passer `durationMs` pour qu'un message d'erreur soit lisible → une durée par défaut plus longue pour les erreurs (option `kind: "error"`).
- [ ] **Toast et bannière de fin au même `z-index: 2`** (`ToastBanner`, `GameOverBanner`) : que le toast passe au-dessus dépend de l'ordre dans le DOM → un `z-index` explicitement plus haut pour le toast.
- [ ] **Export PNG : couleurs et légende à aligner sur la carte** (`mapRender.js`, `drawMapExport`) : l'export a sa propre table de couleurs (drapeau, mine, cœur, révélée) et ignore coffre, hibol, tornade et robot, que `cellMapColor` distingue. → le faire converger vers `cellMapColor` et `MAP_COLOR_VARS`. L'export n'a lieu qu'en fin de partie, donc pas de secret à garder : ajouter une couleur pour les cœurs non révélés. Ajouter aussi une légende, dans une zone de l'image non couverte par des cases révélées, ou à position fixe (bandeau en bas de l'image).
- [ ] **Clés de stockage des introductions encore dans App.vue** (`App.vue:134-137`, `INFINITE_UNLOCKED_KEY` et les trois `SEEN_*_KEY`) : elles ne servent qu'à `useIntroDialog` et au déblocage de l'infini → les déplacer avec le gestionnaire de modes, ou dans un petit module de clés partagé avec `storageReset.js`.
- [ ] **Easing et boucle de tween dupliqués** (`useOriginTween.js`, `useFogRadiusTween.js`) : `easeOutCubic` et la boucle `requestAnimationFrame` recopiés → un petit utilitaire commun.
- [ ] **Sprites encore recopiés à la main** : une vingtaine de `<svg>` + `v-for` de `<rect>` pourraient passer par `PixelIcon` quand on y touchera : `App.vue:1746`, `:1769`, `:1831`, `:1860`, `:1899`, `BurgerMenu.vue:86`, `menu/ShopPage.vue:70`, `:103`, `:128`, `:165`, `:202`, `menu/AchievementsPage.vue:52`, `menu/SettingsPage.vue:250`, `TreasureBanner.vue:38`. `MineCell.vue:59` aussi (7 copies), mais attention aux performances de la grille.
- [ ] **Largeur de la position liée à l'espacement des lettres** (`footer/PositionStat.vue:25`, `.stat-position`) : elle suppose le `letter-spacing: 1px` de `.stats-row` (`footer/footer.css:25`) sans que rien ne l'impose → une variable CSS `--stats-letter-spacing` utilisée aux deux endroits.
- [ ] **`GameOverBanner` : props sans `required`** (`GameOverBanner.vue:7`) : avec `revealedCount` ou `maxDistance` à `undefined`, la bannière afficherait « undefined » → `required: true`.
- [ ] **Distance en ligne arrondie dans le template** (`menu/InfiniteRunsPage.vue:232`) alors que la distance locale l'est déjà à l'enregistrement (`recordRun`) → arrondir une seule fois, en normalisant dans `infiniteOnline.js`.
- [ ] **Prix des skins en dur** (`menu/ShopPage.vue:124` et `:127`, `hibolBalance < 3` et « Buy · 3 ») alors que `shop.js` a `COSMETIC_COST` → lire `cost` de l'entrée `SHOP_ITEMS` du skin.
- [ ] **Reset avec suppression en ligne sans état « en cours »** (`menu/SettingsPage.vue:167`, `confirmReset`) : la confirmation reste ouverte et muette pendant le DELETE, un second tap le relance → bouton désactivé et libellé d'attente pendant l'appel.
- [ ] **`onGridTap` relit encore la position du conteneur** (`App.vue:1289`, `getBoundingClientRect`) : sans gravité (une fois par tap) → exposer la position mémorisée par `useViewportCamera`.

## Moteur et robots

- [ ] **Clics bloqués pour toujours si un pas de robot plante** (`useRobotAnimation.js:166`, `runDueSteps`) : une exception dans `stepRobotWalk` empêche de planifier les pas suivants et laisse `robotAnimationsActive` > 0. → `try`/`catch` qui termine les marches (`finishRobotWalks`) puis arrête les timers.
- [ ] **Pop du robot rejoué au remontage** (`MineCell.vue:223`) : un robot arrêté qui sort du champ puis y revient refait son pop. Mineur. → remettre `robotPop` à `false` sur `animationend`, comme `heartPopped`.
- [ ] **Snapshots de test écrits à la main** (`game.restore.test.js:54`, `game.robot.test.js:122`) : ils dupliquent `saveActiveGame`, d'où l'oubli de `robotMinDensity` passé inaperçu (les tests l'incluaient, pas le vrai code). → extraire une fonction pure `infiniteSnapshot(game)` de `gameStorage.js` et l'utiliser dans les tests.
- [ ] **Helpers de test robot dupliqués** (`useRobotAnimation.test.js:37`) : `room` et `cellProps` recopient ceux de `game.robot.test.js`, sans `closedRoom`. → un module de helpers de test partagé.
- [ ] **Mock incomplet dans `legacyOnline.test.js`** : le mock de `legacyPendingSubmissions` n'expose pas `clearPendingSubmission`, alors que `accountOnline.js` (réel dans ce test) l'importe. Ça passe parce que l'export n'est lu qu'à l'appel → ajouter l'export au mock.
- [ ] **Singletons qui fuient entre tests** (`test/appHarness.js`, `afterEach` des `src/App.*.integration.test.js`) : le helper remet à zéro l'inventaire, `treasureEntries` et `hibolBalance`, mais `usernamePrompted`, la chaîne de réclamation et `unlockedAchievements` le sont encore à la main dans chaque fichier → les ranger dans le helper, ou `vi.resetModules()` avec un import dynamique d'App.
- [ ] **Coups Legacy enregistrés après la fin de partie** (`useLegacyMode.js:139`, `recordMove`) : un tap sur le plateau terminé entre encore au journal, et `submitLegacyWin` reçoit le tableau lui-même, sérialisé seulement après le GET `/best`. Un tap pendant cette attente ajoute donc un coup à la victoire envoyée ; selon que le rejeu serveur ignore ou refuse les coups après la victoire, elle peut être rejetée (à vérifier côté serveur). → n'enregistrer que si `status === "playing"`, et envoyer une copie du journal.
- [ ] **Renvoi Legacy : boucle sans fonction dédiée** (`legacyOnline.js`, `retryPendingLegacySubmissions`) : réutilise `submitLegacyWin`, qui refait un GET `/best` par difficulté à chaque démarrage (3 au plus) et revérifie l'état « pseudo à choisir » déjà testé par la boucle → une fonction d'envoi dédiée.

## Contrat front/back

- [ ] **[serveur] Soumission Legacy sans `moves` → 500** (`LegacyController.java:88`, NullPointerException) → `invalid_moves` (400).
- [ ] **[serveur] Paramètre manquant ou mal typé sur les classements et `/best`** (`difficulty`/`category` absent, `limit=abc`) : corps d'erreur JSON par défaut de Spring au lieu d'un 400 sans corps comme les autres refus → `@ExceptionHandler` pour `MissingServletRequestParameterException` et `MethodArgumentTypeMismatchException`.
- [ ] **[serveur] Longueur du pseudo comptée en UTF-16** (`PlayerService.java:27`) : un emoji compte pour 2, MySQL compte les caractères (la limite de 32 vaut 16 emoji). → `codePointCount`, ou le documenter.
- [ ] **`playerId` importé sans validation** (`playerId.js:11`) : un `player-id` non-UUID venu d'une sauvegarde importée est repris tel quel, et depuis que le serveur exige un UUID, toutes ses soumissions répondent `invalid_request` pour toujours. → valider le format à la lecture ou à l'import, sinon en régénérer un.
- [ ] **Import de sauvegarde : stockage vidé puis réécrit sans filet** (`App.vue:1577`, `onImportSave`) : si un `setItem` échoue (quota plein, fichier venu d'un appareil plus généreux), la progression est déjà effacée, la page ne se recharge pas et rien n'est signalé. → vérifier la taille avant d'effacer, ou garder une copie et la restaurer en cas d'échec, avec un message.
- [ ] **Renvois en ligne lancés en parallèle** (`App.vue:1058`, `retryOnlineQueues`) : démarrage, événement `online` et validation du pseudo peuvent se chevaucher, et une même victoire Legacy part deux fois (deux rejeux serveur, deux envois comptés par la limite par IP). Sans effet sur le score. → garder la promesse en cours et la renvoyer au lieu d'en lancer une seconde.
- [ ] **Réclamation en attente jamais effacée sur `invalid_request`** (`accountOnline.js:113`) : seule une réponse sans `reason` l'efface, elle est renvoyée à chaque démarrage. N'arrive qu'avec un `playerId` hors format (point précédent). → traiter `invalid_request` comme définitif.
- [ ] **[serveur] Deux conventions pour « joueur inconnu »** : `GET /players/{id}/best` répond 200 avec `timeMs: null` (le front s'en sert avant la 1re soumission), `GET /players/{id}` répond 404. À garder, mais à documenter côte à côte dans le README.
- [ ] **[serveur] Routes d'identité sous `/api/legacy/players`** alors qu'elles servent à tous les modes. Renommer seulement avec une période où les deux routes coexistent (APK installés). Priorité basse.
- [ ] **Pairage : réclamation en attente non vidée** (`completeDeviceLink`, `accountOnline.js`) : après un onboarding hors ligne suivi d'un pairage depuis Settings, la réclamation du nom choisi partira pour le `playerId` lié. → `clearPendingClaim()` en cas de succès.
- [ ] **Pairage depuis Settings pendant que le dialogue de pseudo attend** (partie en cours) : l'état « à choisir » est bien effacé, mais les runs gardées ne repartent qu'au prochain démarrage ou retour du réseau → relancer les files après un pairage réussi (exposer `retryOnlineQueues` hors d'App.vue).
- [ ] **`postJson` sans délai maximal** (`onlineApi.js:33`) : un envoi de fond bloqué sur le réseau garde le verrou de réclamation jusqu'au délai du navigateur (plusieurs minutes), les autres envois attendent. → `AbortSignal.timeout(15000)` par défaut.
- [ ] **« Compte disparu » pour un très ancien joueur** (`accountOnline.js:191`) : un joueur qui a choisi son pseudo avant la réclamation à l'onboarding et n'a jamais rien soumis n'a pas de compte serveur ni de réclamation en attente → il verra « Your online account no longer exists ». Sans gravité (il peut retaper son nom). → un marqueur persisté « réclamation réussie au moins une fois ».
- [ ] **Victoire Legacy refusée en 503/429 retentée tard** : la file d'attente n'est relancée qu'au démarrage et sur l'événement `online` (`App.vue`). Une victoire refusée pour `replay_busy` attend le prochain lancement. Priorité basse : un retry différé (quelques minutes) suffirait.

## À garder en tête (pas d'action tant que rien ne change)

- **Génération Infini** : une partie restaurée recalcule `isMine`/`neighborMines` avec le code courant (`restoreInfiniteGame`). Si `isMineAt`/`densityAt`/`densityJitter` changent, versionner le snapshot ou garder l'ancienne formule.
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
