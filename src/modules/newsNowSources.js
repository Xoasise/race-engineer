// Sources NewsNow : une page "Latest" (?type=ln) par écurie -> un salon
// Discord. Remplace src/config/teams.js (flux Google Alerts).
//
// ⚠️ Toyota, Hyundai et M-Sport Ford n'ont pas d'URL NewsNow fournie —
// elles restent à vérifier séparément (probablement pas de page dédiée
// tant qu'elles ne sont pas officiellement sur la grille F1).

module.exports = [
  {
    name: "Ferrari",
    emoji: "🐎",
    url: "https://www.newsnow.co.uk/h/Sport/F1/Ferrari?type=ln",
    channelId: "1376644523161292821",
  },
  {
    name: "Red Bull",
    emoji: "🐃",
    url: "https://www.newsnow.co.uk/h/Sport/F1/Red+Bull?type=ln",
    channelId: "1376855209720156230",
  },
  {
    name: "McLaren",
    emoji: "🧡",
    url: "https://www.newsnow.co.uk/h/Sport/F1/McLaren?type=ln",
    channelId: "1376966424521736342",
  },
  {
    name: "Cadillac",
    emoji: "🦅",
    url: "https://www.newsnow.co.uk/h/Sport/F1/Cadillac?type=ln",
    channelId: "1468402604592861343",
  },
  {
    name: "Audi",
    emoji: "🔴",
    url: "https://www.newsnow.co.uk/h/Sport/F1/Audi?type=ln",
    channelId: "1468402518168965201",
  },
  {
    name: "Haas",
    emoji: "⚪",
    url: "https://www.newsnow.co.uk/h/Sport/F1/Haas?type=ln",
    channelId: "1468402645428600882",
  },
  {
    name: "Racing Bulls",
    emoji: "🐂",
    url: "https://www.newsnow.co.uk/h/Sport/F1/Racing+Bulls?type=ln",
    channelId: "1468402784746475774",
  },
  {
    name: "Aston Martin",
    emoji: "🟢",
    url: "https://www.newsnow.co.uk/h/Sport/F1/Aston+Martin?type=ln",
    channelId: "1376966530251620352",
  },
  {
    name: "Mercedes",
    emoji: "⭐",
    url: "https://www.newsnow.co.uk/h/Sport/F1/Mercedes?type=ln",
    channelId: "1376855123543851078",
  },
  {
    name: "Alpine",
    emoji: "🔵",
    url: "https://www.newsnow.co.uk/h/Sport/F1/Alpine?type=ln",
    channelId: "1468402453174030457",
  },
  {
    name: "Williams",
    emoji: "🔷",
    url: "https://www.newsnow.co.uk/h/Sport/F1/Williams?type=ln",
    channelId: "1468402832028729579",
  },
];
