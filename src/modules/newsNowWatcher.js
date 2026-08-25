const cheerio = require("cheerio");
const { EmbedBuilder } = require("discord.js");
const sources = require("../config/newsNowSources");
const { loadSeen, saveSeen, trim } = require("../utils/seenStore");
const { buildTranslateRow } = require("../utils/newsButtons");

// NewsNow rend son HTML côté serveur, donc un simple fetch + cheerio suffit
// (pas besoin de navigateur headless). Un User-Agent "navigateur" reste
// nécessaire pour éviter un éventuel blocage.
async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// Extrait les articles d'une page NewsNow (onglet "Latest" ?type=ln).
function extractArticles(html) {
  const $ = cheerio.load(html);
  const articles = [];

  $(".article-card").each((_, el) => {
    const $el = $(el);
    const $headline = $el.find("a.article-card__headline").first();
    const link = $headline.attr("href");
    const title = $headline.find(".article-title").text().replace(/\s+/g, " ").trim();
    if (!link || !title) return;

    const publisher = $el.find(".article-publisher__name").first().text().replace(/\s+/g, " ").trim();
    const tsAttr = $el.find(".article-publisher__timestamp[data-timestamp]").first().attr("data-timestamp");
    const pubDate = tsAttr ? new Date(parseInt(tsAttr, 10) * 1000) : new Date();

    // L'image peut être en "src" (nolazy) ou "data-src" (lazyload) selon
    // la position de l'article dans la page.
    const $img = $el.find(".article__image-inner").first();
    const image = $img.attr("src") || $img.attr("data-src") || null;
    const imageUrl = image && image.startsWith("//") ? `https:${image}` : image;

    articles.push({ title, link, publisher, pubDate, image: imageUrl });
  });

  return articles;
}

async function checkNewsNowSources(client) {
  const seen = loadSeen();
  let hasChanges = false;

  for (const source of sources) {
    try {
      const html = await fetchHtml(source.url);
      const articles = extractArticles(html);
      const knownLinks = seen[source.name] || [];
      const newItems = articles.filter((a) => !knownLinks.includes(a.link));

      console.log(`[${source.name}] ${articles.length} article(s) au total, ${newItems.length} nouveau(x)`);

      if (newItems.length === 0) continue;

      const channel = await client.channels.fetch(source.channelId).catch(() => null);
      if (!channel) {
        console.warn(`[${source.name}] Salon introuvable (ID: ${source.channelId})`);
        continue;
      }

      // Premier lancement sur un flux vide = pas d'historique -> on évite de
      // spammer le salon avec tout l'existant d'un coup. Sur les runs
      // suivants, on poste TOUT ce qui est nouveau (même si ça dépasse 20) :
      // sinon les articles au-delà du cap étaient marqués comme "vus" sans
      // jamais être postés -> perte silencieuse pendant les pics d'actu.
      const isFirstRun = knownLinks.length === 0;
      const itemsToPost = (isFirstRun ? newItems.slice(-20) : newItems).reverse();

      for (const item of itemsToPost) {
        const embed = new EmbedBuilder()
          .setAuthor({ name: `${source.emoji} ${source.name}` })
          .setTitle(item.title.slice(0, 256))
          .setURL(item.link)
          .setColor(0xe10600)
          .setFooter({ text: item.publisher ? `${item.publisher} • NewsNow` : "NewsNow" })
          .setTimestamp(item.pubDate);

        if (item.image) embed.setImage(item.image);

                try {
          await channel.send({ embeds: [embed], components: [buildTranslateRow()] });
        } catch (err) {
          console.error(`[${source.name}] Erreur lors de l'envoi de "${item.title}" :`, err.message);
        }
      }

      seen[source.name] = trim([...knownLinks, ...articles.map((a) => a.link)], 500);
      hasChanges = true;
      console.log(`[${source.name}] ${itemsToPost.length} nouvel(le)(s) article(s) posté(s)`);
    } catch (err) {
      console.error(`[${source.name}] Erreur lors du fetch :`, err.message);
    }
  }

  if (hasChanges) saveSeen(seen);
}

module.exports = { checkNewsNowSources };
