const { EmbedBuilder, AttachmentBuilder } = require("discord.js");
const cheerio = require("cheerio");
const { loadSeen, saveSeen, trim } = require("../utils/seenStore");
const { pdfToImagesStream } = require("../utils/pdfToImages");
const { getCurrentRally } = require("../utils/wrcCalendarLocal");
const sportityUrls = require("../config/wrcSportityUrls");
const config = require("../config/wrcDocs");

const MAX_FILES_PER_MESSAGE = 10; // limite Discord
const RESULTS_CHANNEL_ID = "1468547808725438525"; // salon dédié aux classements ("Classification")
const STANDINGS_CHANNEL_ID = "1468553282845806624"; // salon dédié au championnat ("Championship")

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

// Une page Sportity est organisée en sections (Bulletins, Stewards
// Documents, COC Documents, Entry and Start Lists, Results...), chacune
// précédée d'un titre. On parcourt titres et liens PDF dans l'ordre du
// document (cheerio renvoie les éléments d'un sélecteur multiple dans
// l'ordre du DOM) pour rattacher chaque document à la section qui le
// précède, sans dépendre d'une structure imbriquée précise.
function extractDocuments(html) {
  const $ = cheerio.load(html);
  const nodes = $("h1, h2, h3, h4, h5, h6, a").toArray();

  let currentCategory = null;
  const docs = [];

  for (const el of nodes) {
    const $el = $(el);
    const tag = (el.tagName || "").toLowerCase();

    if (tag !== "a") {
      const heading = $el.text().replace(/\s+/g, " ").trim();
      if (heading) currentCategory = heading;
      continue;
    }

    const href = $el.attr("href");
    if (!href) continue;
    // Seuls les liens vers le CDN de documents Sportity nous intéressent
    // (le reste est de la navigation interne à la page : ancres de section,
    // logo, etc.).
    if (!/app-cdn\.sportity\.com/i.test(href) || !/\.pdf(\?|#|$)/i.test(href)) continue;

    // Le texte du lien contient le titre suivi de la date de publication,
    // ex: "Bulletin 1 19 Aug 2026 14:15 -03".
    const rawText = $el.text().replace(/\s+/g, " ").trim();
    const match = rawText.match(
      /^(.*?)\s+(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}\s+\d{2}:\d{2}\s*[+-]\d{1,2}(?::?\d{2})?)$/
    );
    const title = (match ? match[1] : rawText).trim() || "Document WRC";
    const published = match ? match[2].trim() : null;

    docs.push({ title, published, url: href, category: currentCategory });
  }

  return docs;
}

// Envoie un document : un embed d'info (titre + lien) suivi des pages du
// PDF sous forme d'images, en pièces jointes (par lots de 10 max). Même
// logique que postDocument() dans fiaDocsWatcher.js.
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

async function postDocument(channel, doc, rallyName) {
  const authorParts = ["🏁 WRC Documents"];
  if (rallyName) authorParts.push(rallyName.replace(/^\p{Extended_Pictographic}+\s*/u, "").trim());
  if (doc.category) authorParts.push(doc.category);

  const infoEmbed = new EmbedBuilder()
    .setAuthor({ name: authorParts.join(" • ").slice(0, 256) })
    .setTitle(doc.title.slice(0, 256))
    .setURL(doc.url)
    .setColor(0x1e2a45)
    .setFooter({ text: doc.published ? `Publié le ${doc.published}` : "Sportity" });

  let batch = [];
  let batchIndex = 0;
  let pagesRendered = 0;
  let totalPages = 0;

  try {
    const pdfBuffer = await fetchPdfBuffer(doc.url);

    for await (const { buffer, totalPages: tp } of pdfToImagesStream(pdfBuffer, { scale: 1.5, maxPages: 30 })) {
      totalPages = tp;
      pagesRendered++;
      batch.push(buffer);

      if (batch.length === MAX_FILES_PER_MESSAGE) {
        if (pagesRendered === batch.length) {
          await channel.send({ embeds: [infoEmbed] });
        }
        await sendImageBatch(channel, doc, batch, batchIndex);
        batchIndex++;
        batch = [];
      }
    }
  } catch (err) {
    console.error(`[WRC Documents] Erreur de conversion PDF pour "${doc.title}" :`, err.message);
  }

  if (pagesRendered === 0) {
    await channel.send({ embeds: [infoEmbed] });
    return;
  }

  if (batch.length > 0) {
    if (batchIndex === 0) {
      await channel.send({ embeds: [infoEmbed] });
    }
    await sendImageBatch(channel, doc, batch, batchIndex);
  }

  if (totalPages > pagesRendered) {
    console.warn(
      `[WRC Documents] "${doc.title}" a ${totalPages} pages, seules les ${pagesRendered} premières ont été postées`
    );
  }
}

async function checkWrcDocs(client) {
  const rally = getCurrentRally();

  if (!rally) {
    // Pas de week-end de rallye en cours : on ne fait aucune requête
    // réseau, on attend simplement le prochain déclenchement.
    return;
  }

  const sportityUrl = sportityUrls[rally.rally];
  if (!sportityUrl) {
    console.warn(
      `[WRC Documents] Rallye en cours "${rally.rally}" mais aucune URL Sportity configurée dans src/config/wrcSportityUrls.js`
    );
    return;
  }

  const seen = loadSeen();
  const seenKey = `WRC Documents - ${rally.rally}`;
  const knownLinks = seen[seenKey] || [];

  let html;
  try {
    html = await fetchHtml(sportityUrl);
  } catch (err) {
    console.error(`[WRC Documents] Erreur lors du fetch de la page Sportity (${rally.rally}) :`, err.message);
    return;
  }

  let docs;
  try {
    docs = extractDocuments(html);
  } catch (err) {
    console.error(`[WRC Documents] Erreur lors du parsing de la page Sportity (${rally.rally}) :`, err.message);
    return;
  }

  console.log(`[WRC Documents] ${docs.length} document(s) trouvé(s) pour ${rally.rally}`);

  const newDocs = docs.filter((d) => !knownLinks.includes(d.url));
  if (newDocs.length === 0) return;

  const channel = await client.channels.fetch(config.channelId).catch(() => null);
  if (!channel) {
    console.warn(`[WRC Documents] Salon introuvable (ID: ${config.channelId})`);
    return;
  }

  // Salon dédié aux documents de classement
  const resultsChannel = await client.channels.fetch(RESULTS_CHANNEL_ID).catch(() => null);
  if (!resultsChannel) {
    console.warn(`[WRC Documents] Salon "results" introuvable (ID: ${RESULTS_CHANNEL_ID})`);
  }

  // Salon dédié au championnat
  const standingsChannel = await client.channels.fetch(STANDINGS_CHANNEL_ID).catch(() => null);
  if (!standingsChannel) {
    console.warn(`[WRC Documents] Salon "standings" introuvable (ID: ${STANDINGS_CHANNEL_ID})`);
  }

  const failedUrls = new Set();
  for (const doc of newDocs.reverse()) {
    try {
      const isClassification = /classification/i.test(doc.title);
      const isChampionship = /championship/i.test(doc.title);
      const targetChannel = isChampionship && standingsChannel
        ? standingsChannel
        : isClassification && resultsChannel
          ? resultsChannel
          : channel;
      await postDocument(targetChannel, doc, rally.rally);
    } catch (err) {
      console.error(`[WRC Documents] Erreur lors de l'envoi de "${doc.title}" :`, err.message);
      failedUrls.add(doc.url);
    }
  }

  // Comme pour la FIA : on ne marque pas comme "vus" les docs dont l'envoi
  // a échoué, pour qu'ils soient retentés au prochain check.
  const successfulUrls = docs.map((d) => d.url).filter((url) => !failedUrls.has(url));
  seen[seenKey] = trim([...knownLinks, ...successfulUrls], 300);
  saveSeen(seen);
  console.log(
    `[WRC Documents] ${newDocs.length - failedUrls.size} nouveau(x) document(s) posté(s) pour ${rally.rally}`
  );
}

module.exports = { checkWrcDocs };
module.exports.postDocument = postDocument;
