const Parser = require("rss-parser");
const teams = require("../config/teams");
const categories = require("../config/newsFeeds");

const parser = new Parser({
  headers: { "User-Agent": "Mozilla/5.0 (compatible; RaceEngineerBot/1.0)" },
  timeout: 15000, // évite de rester bloqué sur un flux qui ne répond pas
});

function collectSources() {
  const sources = [];
  for (const team of teams) {
    sources.push({ label: `🏎️ ${team.name}`, url: team.feedUrl });
  }
  for (const category of categories) {
    for (const url of category.feedUrls) {
      sources.push({ label: `📰 ${category.name}`, url });
    }
  }
  return sources;
}

// Teste tous les flux RSS/Google Alerts en parallèle et retourne un résumé.
async function checkAllFeedsHealth() {
  const sources = collectSources();

  const results = await Promise.all(
    sources.map(async (src) => {
      const start = Date.now();
      try {
        const feed = await parser.parseURL(src.url);
        return { ...src, ok: true, itemCount: feed.items.length, ms: Date.now() - start };
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
