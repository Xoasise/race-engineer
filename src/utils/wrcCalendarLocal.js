const fs = require("fs");
const path = require("path");

const CALENDAR_FILE = path.join(__dirname, "..", "config", "wrcCalendar2026.json");

// Le calendrier ne donne que des dates (pas d'heure ni de fuseau horaire),
// et les rallyes se déroulent aux quatre coins du monde. Plutôt que de
// risquer de rater le tout début ou la toute fin d'un week-end à cause d'un
// décalage horaire, on élargit la fenêtre de détection d'un jour de chaque
// côté.
const BUFFER_MS = 24 * 60 * 60 * 1000;

function loadCalendar() {
  const raw = JSON.parse(fs.readFileSync(CALENDAR_FILE, "utf-8"));
  return raw.map((r) => ({
    rally: r.rally,
    windowStart: new Date(new Date(`${r.date_debut}T00:00:00Z`).getTime() - BUFFER_MS),
    windowEnd: new Date(new Date(`${r.date_fin}T23:59:59Z`).getTime() + BUFFER_MS),
  }));
}

// Retourne le rallye dont le week-end (avec marge) contient l'instant donné,
// ou null si on est entre deux rallyes (auquel cas le watcher ne fait
// aucune requête réseau).
function getCurrentRally(now = new Date()) {
  const rallies = loadCalendar();
  return rallies.find((r) => now >= r.windowStart && now <= r.windowEnd) || null;
}

module.exports = { getCurrentRally };
