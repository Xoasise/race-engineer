const Parser = require("rss-parser");
const { EmbedBuilder } = require("discord.js");
const categories = require("../config/newsFeeds");
const { loadSeen, saveSeen, trim } = require("../utils/seenStore");

// Certains sites (Autosport, Motorsport...) renvoient une erreur 403 sans
// User-Agent "navigateur". On en met un par défaut pour limiter les échecs.
const parser = new Parser({
  headers: { "User-Agent": "Mozilla/5.0 (compatible; RaceEngineerBot/1.0)" },
  customFields: {
    item: [
      ["media:content", "mediaContent", { keepArray: true }],
      ["media:thumbnail", "mediaThumbnail"],
    ],
  },
});

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

// Les flux RSS "classiques" (hors Google Alerts) mettent l'image à des
// endroits très différents selon le site. On teste les emplacements les
// plus courants dans l'ordre, et on retombe sur "pas d'image" sinon.
function extractImage(item) {
  if (item.enclosure?.url) return item.enclosure.url;

  if (item.mediaContent) {
    const arr = Array.isArray(item.mediaContent) ? item.mediaContent : [item.mediaContent];
    const withUrl = arr.find((m) => m?.$?.url);
    if (withUrl) return withUrl.$.url;
  }

  if (item.mediaThumbnail?.$?.url) return item.mediaThumbnail.$.url;

  const html = item["content:encoded"] || item.content || item.contentSnippet;
  if (typeof html === "string") {
    const match = html.match(/<img[^>]+src="([^">]+)"/i);
    if (match) return match[1];
  }

  return null;
}

async function checkNewsFeeds(client) {
  const seen = loadSeen();
  let hasChanges = false;

  for (const category of categories) {
    const knownLinks = seen[category.name] || [];
    const merged = [];

    // On récupère tous les flux de la catégorie ; un flux en erreur
    // (site down, 403...) ne bloque pas les autres.
    for (const feedUrl of category.feedUrls) {
      try {
        const feed = await parser.parseURL(feedUrl);
        merged.push(...feed.items);
      } catch (err) {
        console.error(`[${category.name}] Erreur lors du fetch de ${feedUrl} :`, err.message);
      }
    }

    if (merged.length === 0) continue;

    // Le même article peut remonter depuis plusieurs flux (ex: news +
    // vidéos Motorsport.com) : on déduplique par lien puis on trie du
    // plus ancien au plus récent pour poster dans l'ordre chronologique.
    const uniqueByLink = new Map();
    for (const item of merged) {
      if (item.link && !uniqueByLink.has(item.link)) uniqueByLink.set(item.link, item);
    }
    const sorted = [...uniqueByLink.values()].sort((a, b) => {
      const dateA = a.pubDate ? new Date(a.pubDate).getTime() : 0;
      const dateB = b.pubDate ? new Date(b.pubDate).getTime() : 0;
      return dateA - dateB;
    });

    const newItems = sorted.filter((item) => !knownLinks.includes(item.link));

    console.log(
      `[${category.name}] ${sorted.length} article(s) au total (tous flux confondus), ${newItems.length} nouveau(x)`
    );

    if (newItems.length === 0) continue;

    const channel = await client.channels.fetch(category.channelId).catch(() => null);
    if (!channel) {
      console.warn(`[${category.name}] Salon introuvable (ID: ${category.channelId})`);
      continue;
    }

    // Avec 5 flux par catégorie, le tout premier lancement peut remonter
    // beaucoup d'articles d'un coup. On limite l'envoi aux 20 plus récents
    // pour éviter de spammer le salon, mais TOUS les articles trouvés sont
    // marqués comme "vus" pour ne jamais les reposter après coup.
    const itemsToPost = newItems.slice(-20);

    for (const item of itemsToPost) {
      const image = extractImage(item);

      // Discord.js refuse une description de chaîne vide (elle doit être
      // soit non-vide, soit absente). Certains articles (notamment les
      // items vidéo) n'ont pas de contentSnippet -> stripHtml renvoie "".
      // Sans cette garde, setDescription("") fait planter tout le process
      // (unhandled 'error' event sur le Client) et provoque un crash-loop.
      const description = stripHtml(item.contentSnippet || "").slice(0, 300);

      const embed = new EmbedBuilder()
        .setAuthor({ name: `${category.emoji} ${category.name}` })
        .setTitle(stripHtml(item.title)?.slice(0, 256) || "Nouvel article")
        .setURL(item.link)
        .setColor(0xe10600)
        .setFooter({ text: `Race Engineer • ${category.name}` })
        .setTimestamp(item.pubDate ? new Date(item.pubDate) : new Date());

      if (description) embed.setDescription(description);
      if (image) embed.setImage(image);

      try {
        await channel.send({ embeds: [embed] });
      } catch (err) {
        // On ne laisse jamais l'échec d'un seul article faire planter
        // tout le bot : on log et on continue avec les suivants.
        console.error(`[${category.name}] Erreur lors de l'envoi de "${item.title}" :`, err.message);
      }
    }

    seen[category.name] = trim([...knownLinks, ...newItems.map((i) => i.link)], 300);
    hasChanges = true;
    console.log(`[${category.name}] ${itemsToPost.length} nouvel(le)(s) article(s) posté(s)`);
  }

  if (hasChanges) saveSeen(seen);
}

module.exports = { checkNewsFeeds };
