const cheerio = require("cheerio");

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; RaceEngineerBot/1.0)" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

function decodeContext(raw) {
  try {
    return JSON.parse(Buffer.from(raw, "base64").toString("utf-8"));
  } catch {
    return null;
  }
}

const MONTHS = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

function parseUtcDate(day, monthAbbr, year) {
  const month = MONTHS[monthAbbr?.toLowerCase()];
  if (month === undefined || !day) return null;
  return new Date(Date.UTC(year, month, day));
}

// Extrait la liste des Grand Prix de la saison depuis la page calendrier
// (hors essais de pré-saison). Chaque round de la grille est un
// <a class="group" data-f1rd-a7s-context="BASE64" href="/en/racing/{year}/{slug}">
// où l'attribut base64 encode un JSON avec raceName/trackCountry. Le texte
// de la carte contient aussi "ROUND N" et une plage de dates du type
// "21 - 23 Aug" (ou "30 Oct - 01 Nov" en cas de chevauchement de mois).
function extractRounds(html, seasonYear) {
  const $ = cheerio.load(html);
  const rounds = [];

  $(`a.group[href^="/en/racing/${seasonYear}/"]`).each((_, el) => {
    const $el = $(el);
    const href = $el.attr("href");
    if (!href || href.includes("pre-season-testing")) return;

    const contextRaw = $el.attr("data-f1rd-a7s-context");
    const context = contextRaw ? decodeContext(contextRaw) : null;

    const text = $el.text();
    const roundMatch = text.match(/ROUND\s*(\d+)/i);
    const dateMatch = text.match(/(\d{1,2})(?:\s+([A-Za-z]{3}))?\s*-\s*(\d{1,2})\s+([A-Za-z]{3})/);
    if (!roundMatch || !dateMatch) return;

    const round = parseInt(roundMatch[1], 10);
    const startDay = parseInt(dateMatch[1], 10);
    const startMonth = dateMatch[2] || dateMatch[4]; // même mois si absent
    const endDay = parseInt(dateMatch[3], 10);
    const endMonth = dateMatch[4];

    const weekendStart = parseUtcDate(startDay, startMonth, seasonYear);
    const weekendEnd = parseUtcDate(endDay, endMonth, seasonYear);
    if (!weekendStart || !weekendEnd) return;

    rounds.push({
      round,
      slug: href.split("/").pop(),
      url: `https://www.formula1.com${href}`,
      raceName: context?.raceName || text.trim(),
      trackCountry: context?.trackCountry || null,
      weekendStart,
      weekendEnd,
    });
  });

  // La carte "Next" en haut de page duplique une entrée déjà présente dans
  // la grille complète plus bas : on déduplique par slug.
  const seenSlugs = new Set();
  return rounds
    .filter((r) => {
      if (seenSlugs.has(r.slug)) return false;
      seenSlugs.add(r.slug);
      return true;
    })
    .sort((a, b) => a.round - b.round);
}

async function fetchSeasonRounds(calendarUrl, seasonYear) {
  const html = await fetchHtml(calendarUrl);
  return extractRounds(html, seasonYear);
}

// Extrait les sessions (FP1/FP2/FP3, Sprint Qualifying, Sprint, Qualifying,
// Race) d'un GP depuis le JSON-LD (schema.org SportsEvent) présent dans sa
// page détail. Horaires exacts en UTC (suffixe "Z") — bien plus fiable que
// de parser le texte affiché, qui dépend du fuseau du visiteur.
function extractSessions(html) {
  const $ = cheerio.load(html);
  const sessions = [];

  $('script[type="application/ld+json"]').each((_, el) => {
    let data;
    try {
      data = JSON.parse($(el).contents().text());
    } catch {
      return;
    }
    if (data["@type"] !== "SportsEvent" || !Array.isArray(data.subEvent)) return;

    for (const sub of data.subEvent) {
      if (!sub.startDate) continue;
      sessions.push({
        // "Practice 1 - Dutch Grand Prix" -> "Practice 1"
        name: sub.name.replace(/\s*-\s*.+$/, ""),
        startDate: new Date(sub.startDate),
        endDate: sub.endDate ? new Date(sub.endDate) : null,
      });
    }
  });

  return sessions.sort((a, b) => a.startDate - b.startDate);
}

async function fetchGpSessions(gpUrl) {
  const html = await fetchHtml(gpUrl);
  return extractSessions(html);
}

module.exports = { fetchSeasonRounds, fetchGpSessions, extractRounds, extractSessions };
