require("dotenv").config();
const http = require("http");
// Polyfill : certaines images Node 18 n'exposent pas `File` en global,
// alors qu'undici (utilisé par discord.js) en a besoin dès son chargement.
if (typeof globalThis.File === "undefined") {
  const { File } = require("node:buffer");
  globalThis.File = File;
}
const { Client, GatewayIntentBits } = require("discord.js");
const cron = require("node-cron");
const { checkFeeds } = require("./modules/newsWatcher");
const { checkNewsFeeds } = require("./modules/rssNewsWatcher");
const { checkFiaDocs, postDocument } = require("./modules/fiaDocsWatcher");
const fiaDocsConfig = require("./config/fiaDocs");

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

async function runAllChecks(client) {
  await checkFeeds(client);
  await checkNewsFeeds(client);
  await checkFiaDocs(client);
}

client.once("ready", async () => {
  console.log(`✅ Race Engineer connecté en tant que ${client.user.tag}`);

  // Premier check au démarrage
  await runAllChecks(client);

  // Puis toutes les X minutes
  cron.schedule(`*/${CHECK_INTERVAL_MINUTES} * * * *`, () => {
    runAllChecks(client);
  });

  console.log(`🔄 Vérification des news toutes les ${CHECK_INTERVAL_MINUTES} minutes`);
});

client.login(process.env.DISCORD_TOKEN);
