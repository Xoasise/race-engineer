const cheerio = require("cheerio");
const { EmbedBuilder } = require("discord.js");
const { loadSeen, saveSeen, trim } = require("../utils/seenStore");
const config = require("../config/mSport");

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; RaceEngineerBot/1.0)" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// Le site M-Sport (Wix) n'a pas de flux RSS, mais la liste des articles est
// servie directement en HTML (pas besoin de navigateur headless).
function extractArticles(html) {
  const $ = cheerio.load(html);
  const articles = [];

  $(".item-link-wrapper").each((_, el) => {
    const $el = $(el);
    const $link = $el.find("a.O16KGI").first();
    let href = $link.attr("href");
    if (!href) return;
    if (href.startsWith("/")) href = `https://www.m-sport.co.uk${href}`;

    const title = $el.find("h2").first().text().replace(/\s+/g, " ").trim();
    if (!title) return;

    const description = $el.find(".BOlnTh").first().text().replace(/\s+/g, " ").trim();

    // Deux <img> par article (version floutée de préchargement + version
    // nette) : on prend la nette, identifiée par ce data-hook.
    const image = $el.find('img[data-hook="gallery-item-image-img"]').first().attr("src") || null;

    articles.push({ title, link: href, description, image });
  });

  return articles;
}

async function checkMSport(client) {
  const seen = loadSeen();
  const knownLinks = seen[config.name] || [];

  let html;
  try {
    html = await fetchHtml(config.url);
  } catch (err) {
    console.error(`[${config.name}] Erreur lors du fetch :`, err.message);
    return;
  }

  let articles;
  try {
    articles = extractArticles(html);
  } catch (err) {
    console.error(`[${config.name}] Erreur lors du parsing :`, err.message);
    return;
  }

  const newItems = articles.filter((a) => !knownLinks.includes(a.link));
  console.log(`[${config.name}] ${articles.length} article(s) au total, ${newItems.length} nouveau(x)`);

  if (newItems.length === 0) return;

  const channel = await client.channels.fetch(config.channelId).catch(() => null);
  if (!channel) {
    console.warn(`[${config.name}] Salon introuvable (ID: ${config.channelId})`);
    return;
  }

  // Premier lancement sur un flux vide = pas d'historique -> on évite de
  // spammer le salon avec tout l'existant d'un coup. Sur les runs suivants,
  // on poste TOUT ce qui est nouveau, même au-delà de 20, pour ne rien perdre
  // pendant un pic d'actu (même correctif que newsNowWatcher.js).
  const isFirstRun = knownLinks.length === 0;
  const itemsToPost = (isFirstRun ? newItems.slice(-20) : newItems).reverse();

  for (const item of itemsToPost) {
    const embed = new EmbedBuilder()
      .setAuthor({ name: `${config.emoji} ${config.name}` })
      .setTitle(item.title.slice(0, 256))
      .setURL(item.link)
      .setColor(0x0d47a1)
      .setFooter({ text: `${config.name} • Site officiel` });

    if (item.description) embed.setDescription(item.description.slice(0, 300));
    if (item.image) embed.setImage(item.image);

    try {
      await channel.send({ embeds: [embed] });
    } catch (err) {
      console.error(`[${config.name}] Erreur lors de l'envoi de "${item.title}" :`, err.message);
    }
  }

  seen[config.name] = trim([...knownLinks, ...articles.map((a) => a.link)], 500);
  saveSeen(seen);
  console.log(`[${config.name}] ${itemsToPost.length} nouvel(le)(s) article(s) posté(s)`);
}

module.exports = { checkMSport };
