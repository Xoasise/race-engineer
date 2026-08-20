require("dotenv").config();
const http = require("http");
// Polyfill : certaines images Node 18 n'exposent pas `File` en global,
// alors qu'undici (utilisé par discord.js) en a besoin dès son chargement.
if (typeof globalThis.File === "undefined") {
  const { File } = require("node:buffer");
  globalThis.File = File;
}
const { Client, GatewayIntentBits } = require("discord.js");
const { EmbedBuilder } = require("discord.js");
const cron = require("node-cron");
const { checkNewsNowSources } = require("./modules/newsNowWatcher");
const { checkNewsFeeds } = require("./modules/rssNewsWatcher");
const { checkFiaDocs, postDocument } = require("./modules/fiaDocsWatcher");
const fiaDocsConfig = require("./config/fiaDocs");
const { checkAllFeedsHealth } = require("./utils/feedHealthCheck");
const { checkMSport } = require("./modules/mSportWatcher");

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

// Filet de sécurité : un événement 'error' non catché sur le Client (ex:
// erreur de validation discord.js sur un embed) ou une promesse rejetée
// non gérée faisait planter tout le process Node avant, provoquant un
// crash-loop (le conteneur redémarre, retombe sur le même article
// problématique, replante...). On log désormais ces erreurs au lieu de
// laisser le process crasher.
client.on("error", (err) => {
  console.error("❌ Erreur Discord Client (non fatale) :", err.message);
});

process.on("unhandledRejection", (err) => {
  console.error("❌ Promesse rejetée non gérée (non fatale) :", err);
});

const CHECK_INTERVAL_MINUTES = parseInt(process.env.CHECK_INTERVAL_MINUTES || "15", 10);

async function runAllChecks(client) {
  // Écuries F1 : scraping NewsNow (remplace les anciens flux Google Alerts).
  await checkNewsNowSources(client);
  // Catégories généralistes (F1 EN/FR, WRC EN/FR) : RSS classique, inchangé.
  await checkMSport(client);
  await checkNewsFeeds(client);
  // Documents FIA : scraping + rendu PDF en images, inchangé.
  await checkFiaDocs(client);
}

client.once("ready", async () => {
  console.log(`✅ Race Engineer connecté en tant que ${client.user.tag}`);

    // Check santé des flux RSS : déclenché uniquement si RUN_FEED_HEALTH_CHECK=true.
  // Poste un résumé dans HEALTH_CHECK_CHANNEL_ID (ou le salon FIA par défaut)
  // en plus des logs détaillés dans la console.
  if (process.env.RUN_FEED_HEALTH_CHECK === "true") {
    console.log("🩺 Vérification de santé des flux RSS en cours...");
    const { ok, broken, total } = await checkAllFeedsHealth();
    console.log(`🩺 ${ok.length}/${total} flux OK, ${broken.length} en erreur`);
    broken.forEach((b) => console.log(`   ❌ ${b.label} — ${b.url} — ${b.error}`));

    const healthChannelId = process.env.HEALTH_CHECK_CHANNEL_ID || fiaDocsConfig.channelId;
    const channel = await client.channels.fetch(healthChannelId).catch(() => null);
    if (channel) {
      const description = broken.length
        ? broken.map((b) => `❌ **${b.label}**\n${b.url}\n\`${b.error}\``).join("\n\n").slice(0, 4000)
        : "✅ Tous les flux répondent correctement.";
      const embed = new EmbedBuilder()
        .setTitle(`🩺 Santé des flux RSS — ${ok.length}/${total} OK`)
        .setDescription(description)
        .setColor(broken.length ? 0xe10600 : 0x2ecc71);
      await channel.send({ embeds: [embed] });
    }
    console.log("🩺 Vérification terminée");
  }

   // Test manuel : si TEST_FIA_DOC_URL est défini, poste ce document une fois
  // au démarrage (sans passer par la logique de dédoublonnage), puis continue
  // normalement. Pratique pour valider le rendu sans attendre un vrai nouveau doc.
  if (process.env.TEST_FIA_DOC_URL) {
    console.log("🧪 Test FIA docs : envoi du document de test...");
    const channel = await client.channels.fetch(fiaDocsConfig.channelId).catch(() => null);
    if (channel) {
      await postDocument(channel, {
        title: "Test document FIA",
        published: null,
        url: process.env.TEST_FIA_DOC_URL,
        eventName: null,
      }).catch((err) => console.error("🧪 Erreur test FIA docs :", err.message));
      console.log("🧪 Test FIA docs : terminé");
    } else {
     console.warn("🧪 Test FIA docs : salon introuvable");
    }
  }

  // Premier check au démarrage
  await runAllChecks(client);

  // Puis toutes les X minutes
  cron.schedule(`*/${CHECK_INTERVAL_MINUTES} * * * *`, () => {
    runAllChecks(client);
  });

  console.log(`🔄 Vérification des news toutes les ${CHECK_INTERVAL_MINUTES} minutes`);
});

client.login(process.env.DISCORD_TOKEN);
