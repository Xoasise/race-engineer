module.exports = {
  channelId: "1468547808725438525", // salon "Classification" (results wrc)
  roleId: "1541233326852149379",

  // Délai d'avertissement avant le début d'une spéciale.
  notifyLeadMinutes: 5,

  // Fréquence de vérification interne (en mémoire, aucune requête réseau) :
  // permet d'avertir précisément 5 min avant sans repoller quoi que ce soit.
  checkIntervalSeconds: 30,
};
