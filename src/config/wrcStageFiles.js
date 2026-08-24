// Mapping rallye -> fichier JSON de ses spéciales (dans
// src/config/wrcStages/), extrait manuellement depuis rally-maps.com.
//
// La clé DOIT correspondre EXACTEMENT au champ "rally" de
// src/config/wrcCalendar2026.json (emoji(s) inclus), même principe que
// src/config/wrcSportityUrls.js. Si un rallye démarre sans fichier
// configuré ici, le watcher log un avertissement à chaque check et
// n'envoie aucun rappel pour ce rallye.
//
// Chaque fichier doit contenir un tableau d'objets :
//   { "numero": "SS 1", "nom": "...", "distance_km": 24.65,
//     "heure": "09:03", "date": "2026-08-28" }
// où "date" est la date locale (fuseau du rallye) de la spéciale, et
// "heure" son heure de départ locale (HH:mm).

module.exports = {
  "🇵🇾 WRC ueno Rally del Paraguay": "paraguay.json",
};
