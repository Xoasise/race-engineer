const fs = require("fs");
const path = require("path");

const SEEN_FILE = path.join(__dirname, "..", "data", "seen.json");

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

function trim(links, max = 200) {
  return links.slice(-max);
}

// Certains flux RSS ajoutent des paramètres de tracking (utm_*, fbclid...)
// qui peuvent varier d'un fetch à l'autre pour le même article. Sans
// normalisation, le lien est comparé tel quel et l'article repasse pour
// "nouveau" à chaque fois -> republication en boucle. On retire ces
// paramètres avant de comparer/stocker les liens.
const TRACKING_PARAMS = [
  "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "utm_id",
  "fbclid", "gclid", "mc_cid", "mc_eid", "ref", "ref_src", "cmpid", "ito",
];

function normalizeLink(link) {
  if (!link) return link;
  try {
    const u = new URL(link);
    TRACKING_PARAMS.forEach((p) => u.searchParams.delete(p));
    u.hash = "";
    return u.toString();
  } catch {
    return link;
  }
}

module.exports = { loadSeen, saveSeen, trim, normalizeLink };
