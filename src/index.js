require("dotenv").config();
const http = require("http");
const { Client, GatewayIntentBits } = require("discord.js");
const cron = require("node-cron");
const { checkFeeds } = require("./modules/newsWatcher");

// Petit serveur HTTP factice : Railway attend qu'un port soit ouvert
// pour considérer le service comme "en bonne santé". Il ne sert à rien
// d'autre que ça, le bot fonctionne uniquement via Discord.
const PORT = process.env.PORT || 3000;
http
  .createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Race Engineer bot is running.");
  })
  .listen(PORT, () => console.log(`🌐 Healthcheck HTTP actif sur le port ${PORT}`));

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

const CHECK_INTERVAL_MINUTES = parseInt(process.env.CHECK_INTERVAL_MINUTES || "15", 10);

client.once("ready", async () => {
  console.log(`✅ Race Engineer connecté en tant que ${client.user.tag}`);

  // Premier check au démarrage
  await checkFeeds(client);

  // Puis toutes les X minutes
  cron.schedule(`*/${CHECK_INTERVAL_MINUTES} * * * *`, () => {
    checkFeeds(client);
  });

  console.log(`🔄 Vérification des news toutes les ${CHECK_INTERVAL_MINUTES} minutes`);
});

client.login(process.env.DISCORD_TOKEN);
