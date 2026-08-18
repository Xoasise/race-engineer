# Race Engineer 🏎️

Bot Discord pour le serveur **Race Paddock**. Surveille un flux Google Alerts (RSS) par écurie de F1 et publie automatiquement les nouveaux articles dans le salon Discord correspondant.

## Fonctionnement

- Chaque écurie a un flux RSS Google Alerts dédié (configuré dans `src/config/teams.js`)
- Le bot vérifie tous les flux toutes les 15 minutes (configurable)
- Les articles déjà publiés sont mémorisés dans `data/seen.json` pour éviter les doublons
- Chaque article est posté sous forme d'embed Discord dans le salon de l'écurie

## Installation locale

```bash
npm install
cp .env.example .env
# Remplis DISCORD_TOKEN dans le fichier .env
npm start
```

## Configuration du bot Discord

Dans le [Discord Developer Portal](https://discord.com/developers/applications) :
1. Sélectionne ton application "Race Engineer"
2. Onglet **Bot** → copie le token → colle-le dans `DISCORD_TOKEN`
3. Aucun "Privileged Gateway Intent" n'est nécessaire (le bot ne lit pas les messages)
4. Onglet **OAuth2 → URL Generator** :
   - Scopes : `bot`
   - Permissions : `Send Messages`, `Embed Links`
   - Utilise l'URL générée pour inviter/re-inviter le bot sur ton serveur si besoin

## Déploiement sur Railway

1. Crée un dépôt GitHub et pousse ce projet (voir commandes ci-dessous)
2. Sur [Railway](https://railway.app) : **New Project → Deploy from GitHub repo**
3. Sélectionne le dépôt `race-engineer-bot`
4. Dans l'onglet **Variables** du service Railway, ajoute :
   - `DISCORD_TOKEN` = ton token de bot
   - `CHECK_INTERVAL_MINUTES` = `15` (ou une autre valeur)
5. Railway détecte automatiquement Node.js et lance `npm start`
6. À chaque `git push`, Railway redéploie automatiquement

⚠️ **Le fichier `data/seen.json` n'est pas persistant entre les redéploiements sur Railway** (le système de fichiers est réinitialisé). Concrètement : après chaque redéploiement, les articles déjà vus seront "oubliés" une fois, ce qui peut entraîner une republication ponctuelle des derniers articles. Si tu veux éviter ça sur le long terme, on pourra migrer le stockage vers une petite base de données (Railway propose du PostgreSQL/Redis gratuit) — dis-le-moi le moment venu, ce sera une évolution simple.

## Pousser le projet sur GitHub (première fois)

```bash
cd race-engineer-bot
git init
git add .
git commit -m "Initial commit - Race Engineer bot"
git branch -M main
git remote add origin https://github.com/TON_USERNAME/race-engineer-bot.git
git push -u origin main
```

## Ajouter/modifier une écurie

Édite simplement `src/config/teams.js` : ajoute un objet `{ name, emoji, feedUrl, channelId }` au tableau, commit, push. Railway redéploie automatiquement.
