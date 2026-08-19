const { EmbedBuilder } = require("discord.js");
const cheerio = require("cheerio");
const { loadSeen, saveSeen, trim } = require("../utils/seenStore");
const config = require("../config/fiaDocs");

const CATEGORY_KEY = "FIA Documents";

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; RaceEngineerBot/1.0)" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// Remonte dans l'arborescence pour retrouver le nom du Grand Prix
// (ex: "Dutch Grand Prix") associé à un lien de document.
function findEventName($, el) {
  let li = $(el).closest("li");
  while (li.length) {
    const clone = li.clone();
    clone.find("ul, ol").remove();
    const text = clone.text().replace(/\s+/g, " ").trim();
    if (text && !/\.pdf$/i.test(text)) return text;
    const parentLi = li.parent().closest("li");
    if (parentLi.get(0) === li.get(0)) break;
    li = parentLi;
  }
  return null;
}

function extractDocuments(html) {
  const $ = cheerio.load(html);
  const docs = [];

  $('a[href$=".pdf"]').each((_, el) => {
    const $el = $(el);
    let href = $el.attr("href");
    if (!href) return;
    if (href.startsWith("/")) href = `https://www.fia.com${href}`;
    if (!href.includes("/system/files/")) return; // ignore d'éventuels autres PDF (menu, footer...)

    const rawText = $el.text().replace(/\s+/g, " ").trim();
    const publishedMatch = rawText.match(/Published on\s+([0-9.]+\s+[0-9:]+\s*\S*)/i);
    const published = publishedMatch ? publishedMatch[1].trim() : null;
    const title = rawText.replace(/Published on.*$/i, "").trim() || "Document FIA";

    docs.push({ title, published, url: href, eventName: findEventName($, el) });
  });

  return docs;
}

async function checkFiaDocs(client) {
  if (!config.channelId) {
    console.warn("[FIA Documents] FIA_DOCS_CHANNEL_ID non défini, watcher désactivé");
    return;
  }

  const seen = loadSeen();
  const knownLinks = seen[CATEGORY_KEY] || [];

  let html;
  try {
    html = await fetchHtml(config.url);
  } catch (err) {
    console.error("[FIA Documents] Erreur lors du fetch de la page :", err.message);
    return;
  }

  let docs;
  try {
    docs = extractDocuments(html);
  } catch (err) {
    console.error("[FIA Documents] Erreur lors du parsing de la page :", err.message);
    return;
  }

  console.log(`[FIA Documents] ${docs.length} document(s) trouvé(s) sur la page`);

  const newDocs = docs.filter((d) => !knownLinks.includes(d.url));
  if (newDocs.length === 0) return;

  const channel = await client.channels.fetch(config.channelId).catch(() => null);
  if (!channel) {
    console.warn(`[FIA Documents] Salon introuvable (ID: ${config.channelId})`);
    return;
  }

  for (const doc of newDocs.reverse()) {
    const embed = new EmbedBuilder()
      .setAuthor({ name: `🏁 FIA Documents${doc.eventName ? " • " + doc.eventName : ""}` })
      .setTitle(doc.title.slice(0, 256))
      .setURL(doc.url)
      .setColor(0x1e2a45)
      .setFooter({ text: doc.published ? `Publié le ${doc.published}` : "FIA" });

    await channel.send({ embeds: [embed] });
  }

  seen[CATEGORY_KEY] = trim([...knownLinks, ...docs.map((d) => d.url)], 300);
  saveSeen(seen);
  console.log(`[FIA Documents] ${newDocs.length} nouveau(x) document(s) posté(s)`);
}

module.exports = { checkFiaDocs };
