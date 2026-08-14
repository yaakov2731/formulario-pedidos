/* ============================== READ CONFIG (encargados) ============================== */

function readConfig_() {
  return readConfigBundle_().config;
}

/* Todos los responsables por local (para la pantalla de Configuración). */
function readResponsables_() {
  return readConfigBundle_().responsables;
}

function readConfigBundle_() {
  var sh = ss_().getSheetByName(SHEET_CONFIG);
  if (!sh) return { config: {}, responsables: {} };
  var values = sh.getDataRange().getValues();
  var config = {}, responsables = {}, start = -1, cLocal = 0, cEnc = 1, cEmail = 2, cAct = -1;
  for (var r = 0; r < values.length; r++) {
    var low = values[r].map(function (c) { return String(c).trim().toLowerCase(); });
    if (low.indexOf('local') > -1 && low.indexOf('encargado') > -1) {
      start = r + 1; cLocal = low.indexOf('local'); cEnc = low.indexOf('encargado'); cEmail = low.indexOf('email'); cAct = low.indexOf('activo'); break;
    }
  }
  if (start === -1) return { config: {}, responsables: {} };
  for (var i = start; i < values.length; i++) {
    var local = normalizeLocalName_(values[i][cLocal]);
    if (!local) break;
    if (local.charAt(0) === '🔧' || local.charAt(0) === '🔗') break;
    if (cAct > -1 && !isActiveFlag_(values[i][cAct])) continue;
    var responsable = {
      nombre: cEnc   > -1 ? String(values[i][cEnc]   || '').trim() : '',
      email:  cEmail > -1 ? String(values[i][cEmail] || '').trim() : ''
    };
    if (!config[local]) config[local] = { enc: responsable.nombre, email: responsable.email };
    if (!responsables[local]) responsables[local] = [];
    responsables[local].push(responsable);
  }
  return { config: config, responsables: responsables };
}
