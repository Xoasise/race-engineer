const fs = require('fs');
const path = require('path');
const Parser = require('rss-parser');
const { EmbedBuilder } = require('discord.js');
const teams = require('../config/teams');

const parser = new Parser();
const SEEN_FILE = path.join(__dirname, '..', '..', 'data', 'seen.json');

// Charge la liste des articles déjà postés (par écurie -> tableau de liens vus)
function loadSeen() {
  try {
    return JSON.parse(fs.readFileSync(SEEN_FILE, 'utf8'));
  } catch (err) {
    return {};
  }
}

function saveSeen(seen) {
  fs.mkdirSync(path.dirname(SEEN_FILE), { recursive: true });
  fs.writeFileSync(SEEN_FILE, JSON.stringify(seen, null, 2));
}

// Limite le nombre de liens gardés en mémoire par écurie pour ne pas
// faire grossir le fichier indéfiniment.
const MAX_SEEN_PER_TEAM = 100;

async function checkFeeds(client) {
  const seen = loadSeen();
  let hasChanges = false;

  for (const team of teams) {
    if (!seen[team.name]) seen[team.name] = [];

    let feed;
    try {
      feed = await parser.parseURL(team.feedUrl);
    } catch (err) {
      console.error(`[${team.name}] Erreur lors de la récupération du flux RSS :`, err.message);
      continue;
    }

    const channel = await client.channels.fetch(team.channelId).catch(() => null);
    if (!channel) {
      console.error(`[${team.name}] Salon Discord introuvable (ID: ${team.channelId})`);
      continue;
    }

    // On traite les articles du plus ancien au plus récent pour un ordre
    // de publication cohérent dans le salon.
    const items = [...feed.items].reverse();

    for (const item of items) {
      const uniqueId = item.link || item.guid;
      if (!uniqueId || seen[team.name].includes(uniqueId)) continue;

      const embed = new EmbedBuilder()
        .setColor(0xE10600)
        .setAuthor({ name: `${team.emoji} ${team.name}` })
        .setTitle(item.title ? item.title.slice(0, 256) : 'Nouvelle actualité')
        .setURL(item.link || null)
        .setDescription(
          item.contentSnippet
            ? item.contentSnippet.replace(/\s+/g, ' ').slice(0, 300)
            : null
        )
        .setFooter({ text: 'Google Alerts' })
        .setTimestamp(item.pubDate ? new Date(item.pubDate) : new Date());

      try {
        await channel.send({ embeds: [embed] });
        seen[team.name].push(uniqueId);
        hasChanges = true;
      } catch (err) {
        console.error(`[${team.name}] Erreur lors de l'envoi du message :`, err.message);
      }
    }

    // On garde seulement les N derniers liens vus pour cette écurie
    if (seen[team.name].length > MAX_SEEN_PER_TEAM) {
      seen[team.name] = seen[team.name].slice(-MAX_SEEN_PER_TEAM);
    }
  }

  if (hasChanges) saveSeen(seen);
}

module.exports = { checkFeeds };
