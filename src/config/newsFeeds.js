// Catégories de news "généralistes" (pas par écurie) : chaque catégorie
// agrège plusieurs flux RSS et poste dans un seul salon Discord.
// Pour ajouter/retirer un flux, édite simplement le tableau feedUrls.

module.exports = [
  {
    name: "F1 News FR",
    emoji: "🇫🇷",
    channelId: "1376586082593931357",
    feedUrls: [
      "https://www.sports.fr/f1/feed",
      "https://sports.auto-moto.com/rss/formule-1.html",
      "https://fr.motorsport.com/rss/f1/videos/",
      "https://fr.motorsport.com/rss/f1/news/",
      "https://f1only.fr/formule1/feed/gn",
    ],
  },
  {
    name: "F1 News EN",
    emoji: "🇬🇧",
    channelId: "1470725269714108542",
    feedUrls: [
      "https://www.motorsport.com/rss/f1/news/",
      "https://www.autosport.com/rss/f1/news/",
      "https://racer.com/f1/feed",
      "https://www.motorsport.com/rss/f1/videos/",
      "http://www.f1reader.com/rss/f1r",
    ],
  },
  {
    name: "WRC News FR",
    emoji: "🇫🇷",
    channelId: "1376596690022170698",
    feedUrls: [
      "https://sports.auto-moto.com/rss/rallye.html",
      "https://fr.motorsport.com/rss/wrc/news/",
      "https://www.rallye-sport.fr/feed/",
      "https://rss.rtbf.be/article/rss/highlight_rtbf_sport-moteurs-rallye.xml?source=internal",
      "https://fr.motorsport.com/rss/wrc/videos/",
    ],
  },
  {
    name: "WRC News EN",
    emoji: "🇬🇧",
    channelId: "1470745727582994546",
    feedUrls: [
      "https://www.motorsport.com/rss/category/rally/news/",
      "https://dirtfish.com/rally/wrc/feed/",
      "https://rallysportmag.com/category/wrc/feed/",
      "https://www.motorsport.com/rss/category/rally/videos/",
      "https://www.autosport.com/rss/wrc/news/",
    ],
  },
];
