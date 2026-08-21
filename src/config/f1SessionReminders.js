// ⚠️ À mettre à jour chaque saison : l'URL du calendrier F1 contient
// l'année (comme src/config/fiaDocs.js pour la page FIA).
module.exports = {
  seasonYear: 2026,
  calendarUrl: "https://www.formula1.com/en/racing/2026",
  channelId: "725345981410836490",

  // Délai d'avertissement avant le début d'une session.
  notifyLeadMinutes: 5,

  // Fréquence de vérification interne (en mémoire, aucune requête réseau) :
  // c'est ce qui permet d'avertir précisément 5 min avant sans avoir à
  // repoller formula1.com toutes les 30 secondes.
  checkIntervalSeconds: 30,
};
