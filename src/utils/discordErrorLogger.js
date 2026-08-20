const { EmbedBuilder } = require("discord.js");

// On groupe les erreurs sur une fenêtre de temps avant d'envoyer, pour
// éviter de spammer le salon (et de se faire rate-limit par Discord) si
// une même erreur se répète plusieurs fois d'affilée (ex: un flux RSS
// qui échoue à chaque itération du cron).
const FLUSH_INTERVAL_MS = 30_000;
const MAX_CHUNK_CHARS = 3800; // marge sous la limite de 4096 d'une description d'embed

let discordClient = null;
let channelId = null;
let buffer = [];
let flushTimer = null;

function formatArg(arg) {
  if (arg instanceof Error) return arg.stack || arg.message;
  if (typeof arg === "object") {
    try {
      return JSON.stringify(arg);
    } catch {
      return String(arg);
    }
  }
  return String(arg);
}

// Découpe le buffer en morceaux qui tiennent chacun dans un embed.
function chunkBuffer(lines) {
  const chunks = [];
  let current = "";
  for (const line of lines) {
    const candidate = current ? `${current}\n${line}` : line;
    if (candidate.length > MAX_CHUNK_CHARS) {
      if (current) chunks.push(current);
      current = line.slice(0, MAX_CHUNK_CHARS);
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

async function flush() {
  if (!discordClient || !channelId || buffer.length === 0) return;

  const toSend = buffer;
  buffer = [];

  const channel = await discordClient.channels.fetch(channelId).catch(() => null);
  if (!channel) return;

  for (const chunk of chunkBuffer(toSend)) {
    const embed = new EmbedBuilder()
      .setTitle("⚠️ Erreurs Race Engineer")
      .setDescription("```" + chunk + "```")
      .setColor(0xe74c3c)
      .setTimestamp();

    await channel.send({ embeds: [embed] }).catch(() => {
      // On évite volontairement de relancer console.error ici pour ne
      // pas créer une boucle infinie si l'envoi Discord échoue.
    });
  }
}

// À appeler une fois le client Discord prêt (dans client.once("ready", ...)).
function initErrorLogger(client, targetChannelId) {
  discordClient = client;
  channelId = targetChannelId;

  if (!flushTimer) {
    flushTimer = setInterval(flush, FLUSH_INTERVAL_MS);
  }

  // On intercepte console.error globalement : aucune modification requise
  // dans les autres fichiers (watchers, index.js...), toutes les erreurs
  // déjà loggées sont automatiquement captées.
  const originalConsoleError = console.error.bind(console);
  console.error = (...args) => {
    originalConsoleError(...args);
    const line = `[${new Date().toISOString()}] ${args.map(formatArg).join(" ")}`;
    buffer.push(line);
  };
}

module.exports = { initErrorLogger };
