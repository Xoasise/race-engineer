const fs = require("fs");
const path = require("path");

const CALENDAR_FILE = path.join(__dirname, "..", "config", "wrcCalendar2026.json");

// Le calendrier donne maintenant, en plus des dates, le fuseau horaire
// local (utc_offset, ex: "+01:00") du lieu du rallye. On peut donc
// calculer le début/fin exact du week-end en UTC (00:00 le premier jour
// à minuit heure locale -> 23:59:59 le dernier jour heure locale), au
// lieu de deviner avec une marge de ±1 jour comme avant.
//
// On garde quand même une petite marge de sécurité (quelques heures) :
// certains shakedowns démarrent tôt le matin du "jour 1", et un débrief
// FIA peut être publié un peu après la fin officielle du dernier jour.
const SAFETY_BUFFER_MS = 3 * 60 * 60 * 1000; // 3h

function loadCalendar() {
  const raw = JSON.parse(fs.readFileSync(CALENDAR_FILE, "utf-8"));
  return raw.map((r) => {
    if (!r.utc_offset) {
      throw new Error(
        `[WRC Calendar] "${r.rally}" n'a pas de champ utc_offset (ex: "+01:00") dans wrcCalendar2026.json`
      );
    }
    return {
      rally: r.rally,
      windowStart: new Date(new Date(`${r.date_debut}T00:00:00${r.utc_offset}`).getTime() - SAFETY_BUFFER_MS),
      windowEnd: new Date(new Date(`${r.date_fin}T23:59:59${r.utc_offset}`).getTime() + SAFETY_BUFFER_MS),
    };
  });
}

// Retourne le rallye dont le week-end (avec petite marge de sécurité)
// contient l'instant donné, ou null si on est entre deux rallyes (auquel
// cas le watcher ne fait aucune requête réseau).
function getCurrentRally(now = new Date()) {
  const rallies = loadCalendar();
  return rallies.find((r) => now >= r.windowStart && now <= r.windowEnd) || null;
}

module.exports = { getCurrentRally };
