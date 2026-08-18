require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const cron = require('node-cron');
const { checkFeeds } = require('./modules/newsWatcher');

const TOKEN = process.env.DISCORD_TOKEN;
const CHECK_INTERVAL_MINUTES = parseInt(process.env.CHECK_INTERVAL_MINUTES || '15', 10);

if (!TOKEN) {
  console.error('❌ DISCORD_TOKEN manquant dans les variables d\'environnement.');
  process.exit(1);
}

// Aucun intent privilégié n'est nécessaire : le bot ne fait que publier
// des messages, il ne lit pas le contenu des messages des utilisateurs.
const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.once('ready', () => {
  console.log(`✅ Race Engineer connecté en tant que ${client.user.tag}`);

  // Premier check immédiat au démarrage
  checkFeeds(client).catch((err) => console.error('Erreur checkFeeds initial :', err));

  // Puis toutes les X minutes (par défaut 15)
  const cronExpression = `*/${CHECK_INTERVAL_MINUTES} * * * *`;
  cron.schedule(cronExpression, () => {
    checkFeeds(client).catch((err) => console.error('Erreur checkFeeds :', err));
  });

  console.log(`📡 Vérification des flux F1 toutes les ${CHECK_INTERVAL_MINUTES} minutes.`);
});

client.login(TOKEN);
