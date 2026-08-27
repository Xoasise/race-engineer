const { EmbedBuilder, AttachmentBuilder } = require("discord.js");
const cheerio = require("cheerio");
const { loadSeen, saveSeen, trim } = require("../utils/seenStore");
const { pdfToImagesStream } = require("../utils/pdfToImages");
const config = require("../config/fiaDocs");
const { getCurrentRound } = require("../utils/f1CalendarLocal");

const CATEGORY_KEY = "FIA Documents";
const MAX_FILES_PER_MESSAGE = 10; // limite Discord
const CLASSIFICATION_CHANNEL_ID = "725345981410836490"; // salon dédié aux classements
const STANDINGS_CHANNEL_ID = "1376589535495983207"; // salon dédié au championnat

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


// Envoie un document : un embed d'info (titre + lien) suivi des pages du
// PDF sous forme d'images, en pièces jointes (par lots de 10 max).
async function sendImageBatch(channel, doc, batch, batchIndex) {
  const startIndex = batchIndex * MAX_FILES_PER_MESSAGE;

  const files = batch.map((imgBuffer, i) =>
    new AttachmentBuilder(imgBuffer, { name: `page-${startIndex + i + 1}.png` })
  );

  const embeds = batch.map((_, i) =>
    new EmbedBuilder()
      .setURL(doc.url)
      .setColor(0x1e2a45)
      .setImage(`attachment://page-${startIndex + i + 1}.png`)
  );

  await channel.send({ embeds, files });
}

async function postDocument(channel, doc) {
  const infoEmbed = new EmbedBuilder()
    .setAuthor({ name: `🏁 FIA Documents${doc.eventName ? " • " + doc.eventName : ""}` })
    .setTitle(doc.title.slice(0, 256))
    .setURL(doc.url)
    .setColor(0x1e2a45)
    .setFooter({ text: doc.published ? `Publié le ${doc.published}` : "FIA" });

  let batch = [];
  let batchIndex = 0;
  let pagesRendered = 0;
  let totalPages = 0;

  try {
    const pdfBuffer = await fetchPdfBuffer(doc.url);

    for await (const { buffer, totalPages: tp } of pdfToImagesStream(pdfBuffer, { scale: 2, maxPages: 30 })) {
      totalPages = tp;
      pagesRendered++;
      batch.push(buffer);

      if (batch.length === MAX_FILES_PER_MESSAGE) {
        if (pagesRendered === batch.length) {
          // premier lot : on envoie d'abord l'embed d'info seul
          await channel.send({ embeds: [infoEmbed] });
        }
        await sendImageBatch(channel, doc, batch, batchIndex);
        batchIndex++;
        batch = [];
      }
    }
  } catch (err) {
    console.error(`[FIA Documents] Erreur de conversion PDF pour "${doc.title}" :`, err.message);
  }

  if (pagesRendered === 0) {
    // Fallback : aucune page rendue, on envoie juste l'embed avec le lien.
    await channel.send({ embeds: [infoEmbed] });
    return;
  }

  if (batch.length > 0) {
    if (batchIndex === 0) {
      // le tout premier (et unique) lot : embed d'info avant
      await channel.send({ embeds: [infoEmbed] });
    }
    await sendImageBatch(channel, doc, batch, batchIndex);
  }

  if (totalPages > pagesRendered) {
    console.warn(
      `[FIA Documents] "${doc.title}" a ${totalPages} pages, seules les ${pagesRendered} premières ont été postées`
    );
  }
}

async function checkFiaDocs(client) {
  if (!config.channelId) {
    console.warn("[FIA Documents] FIA_DOCS_CHANNEL_ID non défini, watcher désactivé");
    return;
  }

  const round = getCurrentRound();
  if (!round) {
    // Pas de weekend de Grand Prix en cours (±24h) : on évite le fetch +
    // parsing de la page FIA à chaque cycle pour rien.
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

const standingsChannel = await client.channels.fetch(STANDINGS_CHANNEL_ID).catch(() => null);
if (!standingsChannel) {
  console.warn(`[FIA Documents] Salon "standings" introuvable (ID: ${STANDINGS_CHANNEL_ID})`);
}

    const failedUrls = new Set();
  for (const doc of newDocs.reverse()) {
  try {
    const isClassification = /classification/i.test(doc.title);
    const isChampionship = /championship/i.test(doc.title);
    const targetChannel = isChampionship && standingsChannel
      ? standingsChannel
      : isClassification && classificationChannel
        ? classificationChannel
        : channel;
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
