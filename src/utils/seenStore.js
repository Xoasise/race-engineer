const fs = require("fs");
const path = require("path");

const SEEN_FILE = path.join(__dirname, "..", "data", "seen.json");

// Charge la liste des articles déjà postés (par clé : nom d'écurie ou
// nom de catégorie) pour éviter les doublons. Le même fichier est
// partagé entre tous les watchers, chacun sous sa propre clé.
function loadSeen() {
  try {
    return JSON.parse(fs.readFileSync(SEEN_FILE, "utf-8"));
  } catch {
    return {};
  }
}

function saveSeen(seen) {
  fs.mkdirSync(path.dirname(SEEN_FILE), { recursive: true });
  fs.writeFileSync(SEEN_FILE, JSON.stringify(seen, null, 2));
}

// Garde uniquement les N derniers liens vus par clé, pour ne pas laisser
// grossir le fichier indéfiniment.
function trim(links, max = 200) {
  return links.slice(-max);
}

module.exports = { loadSeen, saveSeen, trim };
