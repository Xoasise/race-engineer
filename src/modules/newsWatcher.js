const Parser = require("rss-parser");
const fs = require("fs");
const path = require("path");
const { EmbedBuilder } = require("discord.js");
const teams = require("../config/teams");

const parser = new Parser();
const SEEN_FILE = path.join(__dirname, "..", "data", "seen.json");

// Charge la liste des articles déjà postés (par lien) pour éviter les doublons
function loadSeen() {
  try {
    return JSON.parse(fs.readFileSync(SEEN_FILE, "utf-8"));
  } catch {
    return {};
  }
}

function saveSeen(seen) {
  fs.mkdirSync(path.dirname(SEEN_FILE), { recursive: true });
  fs.writeFileSync(SEEN_FILE, JSON.stringify(seen, null, 2));
}

// Garde uniquement les 200 derniers liens vus par écurie, pour ne pas
// laisser grossir le fichier indéfiniment.
function trim(links) {
  return links.slice(-200);
}

// Google Alerts insère des balises HTML (ex: <b>McLaren</b>) autour des
// mots-clés recherchés. Discord ne les interprète pas, donc on les retire.
function stripHtml(text) {
  if (!text) return text;
  return text
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .trim();
}

async function checkFeeds(client) {
  const seen = loadSeen();
  let hasChanges = false;

  for (const team of teams) {
    try {
      const feed = await parser.parseURL(team.feedUrl);
      const knownLinks = seen[team.name] || [];
      const newItems = feed.items.filter((item) => !knownLinks.includes(item.link));

      if (newItems.length === 0) continue;

      const channel = await client.channels.fetch(team.channelId).catch(() => null);
      if (!channel) {
        console.warn(`[${team.name}] Salon introuvable (ID: ${team.channelId})`);
        continue;
      }

      // On poste du plus ancien au plus récent, dans l'ordre chronologique
      for (const item of newItems.reverse()) {
        const embed = new EmbedBuilder()
          .setTitle(stripHtml(item.title)?.slice(0, 256) || "Nouvel article")
          .setURL(item.link)
          .setDescription(stripHtml(item.contentSnippet || "").slice(0, 300))
          .setColor(0xe10600)
          .setFooter({ text: `${team.name} • Google Alerts` })
          .setTimestamp(item.pubDate ? new Date(item.pubDate) : new Date());

        await channel.send({ embeds: [embed] });
      }

      seen[team.name] = trim([...knownLinks, ...newItems.map((i) => i.link)]);
      hasChanges = true;
      console.log(`[${team.name}] ${newItems.length} nouvel(le)(s) article(s) posté(s)`);
    } catch (err) {
      console.error(`[${team.name}] Erreur lors du fetch du flux :`, err.message);
    }
  }

  if (hasChanges) saveSeen(seen);
}

module.exports = { checkFeeds };
