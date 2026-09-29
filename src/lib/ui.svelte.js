// Pannelli aperti da più punti dell'app.
export const ui = $state({ cerca: false, crea: null, visore: null });

/** Apre il foglio "Scrivi"; opz può preimpostare { tipo, data, gruppoId, ragazzoId }. */
export const apriCrea = (opz = {}) => { ui.crea = opz; };
export const chiudiCrea = () => { ui.crea = null; };
