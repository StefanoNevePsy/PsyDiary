// Ruoli familiari predefiniti per l'anagrafica: si sceglie dalla lista o si
// scrive liberamente. I "rapidi" sono i pulsanti per aggiungere un familiare
// con un tocco.
export const RUOLI = [
  { gruppo: 'Genitori', ruoli: ['madre', 'padre', 'madre adottiva', 'padre adottivo', 'madre affidataria', 'padre affidatario'] },
  { gruppo: 'Fratelli', ruoli: ['fratello', 'sorella', 'fratellastro', 'sorellastra', 'fratello gemello', 'sorella gemella'] },
  { gruppo: 'Nonni', ruoli: ['nonna materna', 'nonno materno', 'nonna paterna', 'nonno paterno'] },
  { gruppo: 'Famiglia ricomposta', ruoli: ['compagno della madre', 'compagna del padre', 'patrigno', 'matrigna'] },
  { gruppo: 'Altri parenti', ruoli: ['zia', 'zio', 'cugina', 'cugino', 'bisnonna', 'bisnonno'] },
  { gruppo: 'Altre figure', ruoli: ['tutore', 'tutrice', 'educatore di comunità', 'educatrice di comunità', 'baby-sitter'] },
];
export const RAPIDI = ['madre', 'padre', 'fratello', 'sorella', 'nonna', 'nonno', 'zia', 'zio'];

/** Suggerimenti per il campo "Relazione" (con i gruppi come titoletti). */
export const suggerimentiRuoli = () => RUOLI.flatMap((g) => g.ruoli.map((valore) => ({ valore, gruppo: g.gruppo })));
