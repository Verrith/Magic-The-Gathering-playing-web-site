# MTG Table

Table de jeu Magic multijoueur, avec une interface inspirée des tables de jeu d'Aura : tapis plein écran, main en bas, piles à droite, journal/chat à gauche et commandes flottantes au-dessus du plateau. Le dépôt est un frontend HTML/CSS/JavaScript statique. Sans service externe configuré, les decks et la partie restent sauvegardés dans le stockage local du navigateur.

## Fonctionnalités disponibles

- Import d'une liste collée ou d'un fichier `.txt`, avec aperçu, quantités, commentaires et sections Mainboard, Commander, Sideboard, Companion, Maybeboard et Wishboard.
- Vérification des noms par l'API Scryfall et mise en cache locale des métadonnées et images. La recherche est exacte en premier; chaque carte non reconnue peut être corrigée et relancée en recherche approximative.
- Bibliothèque de decks locale, sélection/chargement d'un deck, mélange, pioche, main, champ de bataille, cimetière et exil.
- Consultation du cimetière et de l'exil en cliquant sur leurs piles; la bibliothèque permet de révéler sa première carte ou de consulter toute la liste sans la modifier.
- Les cartes marquées **Commander** commencent dans une zone Commandant dédiée et sont exclues de la bibliothèque et de la main de départ.
- Table multijoueur façon Aura : les plateaux des joueurs apparaissent côte à côte sur une grande toile. Glissez le fond pour vous déplacer, zoomez à la molette ou avec les boutons, puis recentrez la vue au besoin. Les cartes peuvent être posées et déplacées librement sur la toile, y compris par-dessus d'autres permanents; leurs positions sont conservées. Survolez une carte pour l’afficher en grand. Rotation au clic, menu contextuel, retournement, marqueurs, jetons, copies, détails de carte, changement d'impression et renvoi mélangé dans la bibliothèque.
- Réserve visible pour le sideboard et le compagnon; les autres sections restent dans les données du deck.
- Salle Supabase facultative avec pseudo, invitation par lien ou code, présence, chat synchronisé, points de vie et synchronisation des cartes publiques du champ de bataille. Les mains et bibliothèques ne sont pas publiées.
- Lien fourni dans le brief : Aura a ouvert une salle contenant déjà un deck. Le nouveau site reste autonome; aucune donnée de cette salle Aura n'a été importée.

## Importer depuis Moxfield ou Archidekt

Dans l'onglet **Moxfield**, collez l'URL de votre deck et utilisez **Ouvrir le deck**. Sur Moxfield, copiez ensuite la liste depuis **More → Export**, collez-la dans MTG Table et lancez l'analyse. Le deck suit le même aperçu Scryfall et le même chargement que les autres imports. L'URL seule n'est pas chargée automatiquement : Moxfield ne fournit pas d'API publique documentée pour lire les decks. Archidekt peut être importé avec une liste exportée dans l'onglet **Liste TXT**.

## Démarrage local

1. Ouvrez `index.html` dans un navigateur, ou servez le dossier avec un serveur statique local. Scryfall et Supabase nécessitent une connexion Internet.
2. Cliquez **Choisir un deck**, puis **Importer un deck**. Collez une carte par ligne (`1 Sol Ring`) ou choisissez un fichier `.txt`, puis vérifiez et confirmez l'aperçu.
3. Cliquez sur un deck dans le sélecteur pour le charger. Les cartes Mainboard et Commander sont mélangées dans la bibliothèque; Sideboard et Companion sont dans la zone de réserve.

Les données sont dans `localStorage` sur cet appareil et ce navigateur. Le menu contextuel d'un deck (clic droit) permet de le supprimer. La recherche d'images suit l'API de cartes Scryfall et n'héberge pas leurs images.

## Activer le multijoueur Supabase

1. Créez un projet Supabase et activez **Anonymous Sign-ins** dans Authentication → Providers.
2. Exécutez [`supabase/schema.sql`](supabase/schema.sql) dans le SQL Editor du projet.
3. Renseignez l'URL du projet et sa clé publique `anon`/`publishable` dans `config.js`. Ne mettez jamais une clé `service_role` dans ce fichier.
4. Servez le site via HTTPS (localhost convient pour le développement). `index.html` charge le client Supabase depuis jsDelivr.
5. Créez une salle privée ou saisissez son code. Le lien copié contient `?room=CODE`; les joueurs doivent ouvrir le site, saisir leur pseudo et rejoindre la salle.

Le SQL laisse les membres lire et déplacer les objets publics du champ de bataille. Les objets en main et bibliothèque restent visibles seulement par leur propriétaire. Dans cette version, les cartes détenues par le navigateur restent locales; seules les cartes posées au champ de bataille sont publiées. La clé anon est publique par conception et protégée par RLS; aucune clé de service n'est nécessaire.

## GitHub Pages

Dans Settings → Pages, choisissez **Deploy from a branch**, branche `main`, dossier `/ (root)`. Le dépôt contient déjà `index.html` à la racine. Configurez les valeurs publiques Supabase de `config.js` avant le déploiement si vous voulez les salles synchronisées. Scryfall doit rester accessible au navigateur. Aucun backend propriétaire n'est requis pour l'import TXT.

## Limites connues

- Aucun deck d'exemple Moxfield/Archidekt concret n'était présent dans le brief : le champ contenait encore `[COLLER ICI ...]`. Le lien reçu ouvre une salle de jeu Aura et non une page de deck importable; aucune prétention n'est faite d'avoir testé un import de ce deck.
- Les interactions de table et les decks sont sauvegardés localement. Supabase synchronise les salles, les pseudos, les vies et les objets publics du champ de bataille, mais les bibliothèques et mains ne sont pas synchronisées entre navigateurs dans cette version.
- L'API Scryfall et le CDN d'images sont des services externes soumis à leur disponibilité et à leurs limites. Les métadonnées demandées sont mises en cache dans le navigateur.
- Ce prototype ne fait pas appliquer les règles de Magic.
