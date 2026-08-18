const Parser = require("rss-parser");
const { EmbedBuilder } = require("discord.js");
const teams = require("../config/teams");
const { loadSeen, saveSeen, trim } = require("../utils/seenStore");

const parser = new Parser({
  headers: { "User-Agent": "Mozilla/5.0 (compatible; RaceEngineerBot/1.0)" },
});

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

      console.log(`[${team.name}] Flux lu : ${feed.items.length} article(s) au total, ${newItems.length} nouveau(x)`);

      if (newItems.length === 0) continue;

      const channel = await client.channels.fetch(team.channelId).catch(() => null);
      if (!channel) {
        console.warn(`[${team.name}] Salon introuvable (ID: ${team.channelId})`);
        continue;
      }

      // On poste du plus ancien au plus récent, dans l'ordre chronologique
      for (const item of newItems.reverse()) {
        const embed = new EmbedBuilder()
          .setAuthor({ name: `${team.emoji} ${team.name}` })
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
