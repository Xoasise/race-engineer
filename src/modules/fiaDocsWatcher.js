const { EmbedBuilder, AttachmentBuilder } = require("discord.js");
const cheerio = require("cheerio");
const { loadSeen, saveSeen, trim } = require("../utils/seenStore");
const { pdfToImages } = require("../utils/pdfToImages");
const config = require("../config/fiaDocs");

const CATEGORY_KEY = "FIA Documents";
const MAX_FILES_PER_MESSAGE = 10; // limite Discord
const CLASSIFICATION_CHANNEL_ID = "725345981410836490"; // salon dédié aux classements

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; RaceEngineerBot/1.0)" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function fetchPdfBuffer(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; RaceEngineerBot/1.0)" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
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
    if (!href.includes("/system/files/")) return;

    const rawText = $el.text().replace(/\s+/g, " ").trim();
    const publishedMatch = rawText.match(/Published on\s+([0-9.]+\s+[0-9:]+\s*\S*)/i);
    const published = publishedMatch ? publishedMatch[1].trim() : null;
    const title = rawText.replace(/Published on.*$/i, "").trim() || "Document FIA";

    docs.push({ title, published, url: href, eventName: findEventName($, el) });
  });

  return docs;
}

function chunk(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) chunks.push(array.slice(i, i + size));
  return chunks;
}

// Envoie un document : un embed d'info (titre + lien) suivi des pages du
// PDF sous forme d'images, en pièces jointes (par lots de 10 max).
async function postDocument(channel, doc) {
  const infoEmbed = new EmbedBuilder()
    .setAuthor({ name: `🏁 FIA Documents${doc.eventName ? " • " + doc.eventName : ""}` })
    .setTitle(doc.title.slice(0, 256))
    .setURL(doc.url)
    .setColor(0x1e2a45)
    .setFooter({ text: doc.published ? `Publié le ${doc.published}` : "FIA" });

  let images = [];
  let totalPages = 0;
  try {
    const pdfBuffer = await fetchPdfBuffer(doc.url);
    const result = await pdfToImages(pdfBuffer, { scale: 2, maxPages: 30 });
    images = result.images;
    totalPages = result.totalPages;
  } catch (err) {
    console.error(`[FIA Documents] Erreur de conversion PDF pour "${doc.title}" :`, err.message);
  }

  if (images.length === 0) {
    // Fallback : pas d'image dispo, on envoie juste l'embed avec le lien.
    await channel.send({ embeds: [infoEmbed] });
    return;
  }

  // L'embed d'info part dans son propre message : ça évite de dépasser la
  // limite Discord de 10 embeds/message quand le premier lot d'images est
  // déjà plein (10 images + 1 info = 11, refusé par Discord).
  await channel.send({ embeds: [infoEmbed] });

  const batches = chunk(images, MAX_FILES_PER_MESSAGE);

  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b];
    const startIndex = b * MAX_FILES_PER_MESSAGE;

    const files = batch.map((imgBuffer, i) =>
      new AttachmentBuilder(imgBuffer, { name: `page-${startIndex + i + 1}.png` })
    );

    const embeds = batch.map((_, i) =>
      new EmbedBuilder()
        .setURL(doc.url) // même URL sur chaque embed pour les regrouper en galerie
        .setColor(0x1e2a45)
        .setImage(`attachment://page-${startIndex + i + 1}.png`)
    );

    await channel.send({ embeds, files });
  }

  if (totalPages > images.length) {
    console.warn(
      `[FIA Documents] "${doc.title}" a ${totalPages} pages, seules les ${images.length} premières ont été postées`
    );
  }
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

  // Salon dédié aux documents de classement
const classificationChannel = await client.channels.fetch(CLASSIFICATION_CHANNEL_ID).catch(() => null);
if (!classificationChannel) {
  console.warn(`[FIA Documents] Salon "classification" introuvable (ID: ${CLASSIFICATION_CHANNEL_ID})`);
}

    const failedUrls = new Set();
  for (const doc of newDocs.reverse()) {
  try {
    const isClassification = /classification/i.test(doc.title);
    const targetChannel = isClassification && classificationChannel ? classificationChannel : channel;
    await postDocument(targetChannel, doc);
    } catch (err) {
      console.error(`[FIA Documents] Erreur lors de l'envoi de "${doc.title}" :`, err.message);
      failedUrls.add(doc.url);
    }
  }

  // On ne marque pas comme "vus" les docs dont l'envoi a échoué, pour
  // qu'ils soient retentés au prochain check plutôt que perdus.
  const successfulUrls = docs.map((d) => d.url).filter((url) => !failedUrls.has(url));
  seen[CATEGORY_KEY] = trim([...knownLinks, ...successfulUrls], 300);
  saveSeen(seen);
  console.log(`[FIA Documents] ${newDocs.length - failedUrls.size} nouveau(x) document(s) posté(s)`);
}

module.exports = { checkFiaDocs };
module.exports.postDocument = postDocument;
