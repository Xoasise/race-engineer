const fs = require("fs");
const path = require("path");
const SAFETY_BUFFER_MS = 24 * 60 * 60 * 1000; // 24h avant/après

const CALENDAR_FILE = path.join(__dirname, "..", "config", "f1Calendar2026.json");

// Charge le fichier JSON et convertit les dates en objets Date.
function loadCalendar() {
  const raw = JSON.parse(fs.readFileSync(CALENDAR_FILE, "utf-8"));
  return raw.map((s) => ({
    gp: s.gp,
    session: s.session,
    startDate: new Date(s.debut),
    endDate: new Date(s.fin),
  }));
}

// Regroupe les sessions par Grand Prix ("round"). Le nom du GP sert
// d'identifiant unique (équivalent du "slug" de l'ancien scraper), et les
// sessions sont déjà présentes ici : plus besoin d'un 2e fetch par round.
function getRounds() {
  const all = loadCalendar();
  const byGp = new Map();

  for (const s of all) {
    if (!byGp.has(s.gp)) byGp.set(s.gp, []);
    byGp.get(s.gp).push(s);
  }

  const rounds = [];
  for (const [gp, sessions] of byGp) {
    sessions.sort((a, b) => a.startDate - b.startDate);
    rounds.push({
      slug: gp,
      raceName: gp,
      weekendStart: sessions[0].startDate,
      weekendEnd: sessions[sessions.length - 1].endDate,
      sessions: sessions.map((s) => ({ name: s.session, startDate: s.startDate })),
    });
  }

  return rounds.sort((a, b) => a.weekendStart - b.weekendStart);
}

// Retourne le round dont la fenêtre (avec marge) contient l'instant donné,
// ou null si on est entre deux weekends (le watcher ne fait alors aucune
// requête réseau). Même principe que getCurrentRally() dans wrcCalendarLocal.js.
function getCurrentRound(now = new Date()) {
  const rounds = getRounds();
  return rounds.find((r) => {
    const start = new Date(r.weekendStart.getTime() - SAFETY_BUFFER_MS);
    const end = new Date(r.weekendEnd.getTime() + SAFETY_BUFFER_MS);
    return now >= start && now <= end;
  }) || null;
}

module.exports = { getRounds };
