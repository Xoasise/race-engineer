const Parser = require("rss-parser");
const categories = require("../config/newsFeeds");
const newsNowSources = require("../config/newsNowSources");

const parser = new Parser({
  headers: { "User-Agent": "Mozilla/5.0 (compatible; RaceEngineerBot/1.0)" },
  timeout: 15000, // évite de rester bloqué sur un flux qui ne répond pas
});

const NEWSNOW_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
};

function collectSources() {
  const sources = [];
  for (const category of categories) {
    for (const url of category.feedUrls) {
      sources.push({ label: `📰 ${category.name}`, url, type: "rss" });
    }
  }
  for (const source of newsNowSources) {
    sources.push({ label: `🏎️ ${source.name}`, url: source.url, type: "newsnow" });
  }
  return sources;
}

// Teste une source NewsNow : on considère que ça marche si la page répond
// en 200 et contient au moins une carte d'article (le site pourrait très
// bien répondre 200 sur une page d'erreur/captcha sans le contenu attendu).
async function checkNewsNowSource(url) {
  const res = await fetch(url, { headers: NEWSNOW_HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const itemCount = (html.match(/class="[^"]*\barticle-card\b[^"]*"/g) || []).length;
  if (itemCount === 0) throw new Error("0 article-card trouvé (sélecteur cassé ou page bloquée ?)");
  return itemCount;
}

// Teste tous les flux RSS/Google Alerts + sources NewsNow en parallèle et
// retourne un résumé.
async function checkAllFeedsHealth() {
  const sources = collectSources();

  const results = await Promise.all(
    sources.map(async (src) => {
      const start = Date.now();
      try {
        const itemCount =
          src.type === "newsnow" ? await checkNewsNowSource(src.url) : (await parser.parseURL(src.url)).items.length;
        return { ...src, ok: true, itemCount, ms: Date.now() - start };
      } catch (err) {
        return { ...src, ok: false, error: err.message, ms: Date.now() - start };
      }
    })
  );

  return {
    total: results.length,
    ok: results.filter((r) => r.ok),
    broken: results.filter((r) => !r.ok),
  };
}

module.exports = { checkAllFeedsHealth };
