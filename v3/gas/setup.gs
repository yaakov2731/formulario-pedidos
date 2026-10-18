/* Docks V3 · preparación de la planilla (§3). Idempotente: crea lo que falta, corrige encabezados
 * y validaciones; nunca borra filas ni mueve datos de columna. */

function setupV3() {
  var lock = LockService.getScriptLock();
  lock.waitLock(V3_LOCK_MS);
  try {
    resetReq_();
    var ss = ss_();
    var res = { ok: true, version: V3_VERSION, creadas: [], corregidas: [], semilla: false };

    V3_SHEET_ORDER.forEach(function (name, pos) {
      var sh = ss.getSheetByName(name);
      if (!sh) {
        sh = ss.insertSheet(name, Math.min(pos, ss.getSheets().length));
        res.creadas.push(name);
      }
      if (sh.getIndex() !== pos + 1) {
        ss.setActiveSheet(sh);
        ss.moveActiveSheet(pos + 1);
      }
      if (V3_HEADERS[name] && setupHeaders_(sh, V3_HEADERS[name])) res.corregidas.push(name);
    });

    borrarHojaVaciaInicial_(ss);
    res.semilla = sembrarLocales_(ss.getSheetByName(SH_LOCALES));
    Object.keys(V3_HEADERS).forEach(function (name) {
      var sh = ss.getSheetByName(name);
      formatoTexto_(sh, V3_TEXT_COLUMNS[name] || []);
    });
    setupValidaciones_(ss);
    setupTablero_(ss, ss.getSheetByName(SH_TABLERO));
    proteger_(ss.getSheetByName(SH_TABLERO), 'TABLERO se arma con fórmulas: no editar a mano.');
    proteger_(ss.getSheetByName(SH_LOG), 'LOG lo escribe el sistema: no editar a mano.');
    SpreadsheetApp.flush();
    log_('setupV3', '', '', true, 'Creadas: ' + (res.creadas.join(', ') || 'ninguna') +
      ' · Corregidas: ' + (res.corregidas.join(', ') || 'ninguna') + (res.semilla ? ' · Semilla LOCALES' : ''));
    return res;
  } finally {
    lock.releaseLock();
  }
}

/**
 * Instalación en un paso: crea o corrige las pestañas y, si no existe, genera la clave de gerencia.
 * La clave se muestra sólo en el registro de ejecución de quien corre la función.
 */
function instalarV3() {
  setupV3();
  var props = PropertiesService.getScriptProperties();
  var clave = props.getProperty('ADMIN_KEY');
  if (!clave) {
    clave = Utilities.getUuid().replace(/-/g, '').slice(0, 10);
    props.setProperty('ADMIN_KEY', clave);
    Logger.log('Clave de administración creada: ' + clave);
    Logger.log('Guardala. Se cambia en Configuración del proyecto → Propiedades de la secuencia de comandos (ADMIN_KEY).');
  } else {
    Logger.log('Ya había una clave de administración (ADMIN_KEY). No se cambió.');
  }
  Logger.log('Planilla V3: ' + ss_().getUrl());
  return { ok: true, admin_key_nueva: !props.getProperty('ADMIN_KEY') ? false : true };
}

/**
 * setFormula usa el separador de argumentos de la configuración regional de la planilla:
 * en es_AR es ";". Se escribe con "," y, si la planilla marca error de sintaxis, se reescribe con ";".
 */
function setFormulaLocal_(range, formula) {
  range.setFormula(formula);
  SpreadsheetApp.flush();
  if (String(range.getDisplayValue()) === '#ERROR!') range.setFormula(formulaConPuntoYComa_(formula));
}

/** Cambia "," por ";" sólo fuera de los textos entre comillas dobles. */
function formulaConPuntoYComa_(formula) {
  var out = '', enTexto = false;
  for (var i = 0; i < formula.length; i++) {
    var c = formula.charAt(i);
    if (c === '"') enTexto = !enTexto;
    out += (!enTexto && c === ',') ? ';' : c;
  }
  return out;
}

function onOpen() {
  try {
    SpreadsheetApp.getUi().createMenu('Docks V3').addItem('Preparar o reparar planilla', 'setupV3').addToUi();
  } catch (e) { /* sin interfaz */ }
}

/* Escribe o corrige los encabezados de la fila 1. Devuelve true si cambió algo. */
function setupHeaders_(sh, headers) {
  var lastCol = sh.getLastColumn();
  var actual = lastCol ? sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h == null ? '' : h).trim(); }) : [];
  var vacia = actual.every(function (h) { return !h; });
  var nuevos;
  var cambio = false;
  if (vacia) {
    nuevos = headers.slice();
    cambio = true;
  } else {
    nuevos = actual.slice();
    var compacto = function (s) { return norm_(s).replace(/[\s_]/g, ''); };
    headers.forEach(function (h) {
      if (nuevos.indexOf(h) > -1) return;
      var j = -1;
      for (var k = 0; k < nuevos.length; k++) {
        if (nuevos[k] && headers.indexOf(nuevos[k]) < 0 && compacto(nuevos[k]) === compacto(h)) { j = k; break; }
      }
      if (j > -1) nuevos[j] = h;
      else nuevos.push(h);
      cambio = true;
    });
  }
  if (nuevos.length > sh.getMaxColumns()) sh.insertColumnsAfter(sh.getMaxColumns(), nuevos.length - sh.getMaxColumns());
  if (cambio) sh.getRange(1, 1, 1, nuevos.length).setValues([nuevos]);
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, nuevos.length).setFontWeight('bold');
  return cambio && !vacia;
}

function borrarHojaVaciaInicial_(ss) {
  ss.getSheets().forEach(function (sh) {
    var name = sh.getName();
    if (V3_SHEET_ORDER.indexOf(name) > -1) return;
    if (!/^(Hoja|Sheet)\s*\d+$/i.test(name)) return;
    if (sh.getLastRow() > 0 || sh.getLastColumn() > 0) return;
    if (ss.getSheets().length > 1) ss.deleteSheet(sh);
  });
}

function sembrarLocales_(sh) {
  if (sh.getLastRow() > 1) return false;
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); });
  var filas = LOCALES_SEMILLA.map(function (l) {
    var obj = { 'Local': l[0], 'Activo': l[2], 'Encargados': '', 'Dia_Pedido': 'Lunes', 'Hora_Corte': '14:00', 'Prefijo_Codigo': l[1], 'Observaciones': '' };
    return headers.map(function (h) { return obj[h] !== undefined ? obj[h] : ''; });
  });
  formatoTexto_(sh, V3_TEXT_COLUMNS[SH_LOCALES]);
  sh.getRange(2, 1, filas.length, headers.length).setValues(filas);
  return true;
}

function colDe_(sh, header) {
  var lastCol = sh.getLastColumn();
  var hs = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });
  var i = hs.indexOf(header);
  return i < 0 ? 0 : i + 1;
}

function letraCol_(n) {
  var s = '';
  while (n > 0) {
    var m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function rangoColumna_(sh, header) {
  var c = colDe_(sh, header);
  var filas = sh.getMaxRows() - 1;
  if (!c || filas < 1) return null;
  return sh.getRange(2, c, filas, 1);
}

function formatoTexto_(sh, headers) {
  headers.forEach(function (h) {
    var r = rangoColumna_(sh, h);
    if (r) r.setNumberFormat('@');
  });
}

function setupValidaciones_(ss) {
  var locales = ss.getSheetByName(SH_LOCALES);
  var proveedores = ss.getSheetByName(SH_PROVEEDORES);
  var rLocales = locales.getRange(2, colDe_(locales, 'Local') || 1, Math.max(locales.getMaxRows() - 1, 1), 1);
  var rProv = proveedores.getRange(2, colDe_(proveedores, 'Proveedor') || 1, Math.max(proveedores.getMaxRows() - 1, 1), 1);

  function lista(valores, aviso) {
    return SpreadsheetApp.newDataValidation().requireValueInList(valores, true).setAllowInvalid(!!aviso).build();
  }
  function rango(r, aviso, ayuda) {
    var b = SpreadsheetApp.newDataValidation().requireValueInRange(r, true).setAllowInvalid(!!aviso);
    if (ayuda) b = b.setHelpText(ayuda);
    return b.build();
  }
  var vLocal = rango(rLocales, false, 'Elegí un local de la pestaña LOCALES.');
  var vProv = rango(rProv, true, 'El proveedor no está en PROVEEDORES (aviso: se acepta igual).');
  var vUnidad = lista(V3_UNIDADES);
  var reglas = {
    CATALOGO: { 'Local': vLocal, 'Unidad': vUnidad, 'Proveedor': vProv, 'Estado': lista(EST_PROD) },
    PROVEEDORES: { 'Activo': lista(SI_NO) },
    LOCALES: { 'Activo': lista(SI_NO), 'Dia_Pedido': lista(DIAS_SEMANA) },
    PEDIDOS: { 'Local': vLocal, 'Prioridad': lista(PRIORIDADES), 'Estado': lista(EST_PEDIDO) },
    PEDIDO_LINEAS: { 'Local': vLocal, 'Unidad': vUnidad, 'Proveedor': vProv, 'Estado': lista(EST_LINEA) },
    MOVIMIENTOS: { 'Tipo': lista(TIPOS_MOV), 'Local': vLocal, 'Unidad': vUnidad },
    COMPRAS: { 'Proveedor': vProv, 'Estado': lista(EST_OC) }
  };
  Object.keys(reglas).forEach(function (name) {
    var sh = ss.getSheetByName(name);
    Object.keys(reglas[name]).forEach(function (h) {
      var r = rangoColumna_(sh, h);
      if (r) r.setDataValidation(reglas[name][h]);
    });
  });
}

function proteger_(sh, descripcion) {
  var ya = sh.getProtections(SpreadsheetApp.ProtectionType.SHEET);
  var p = ya.length ? ya[0] : sh.protect();
  p.setDescription(descripcion);
  p.setWarningOnly(true);
}

/* TABLERO (§3.3): B1 selector de local; cinco bloques QUERY lado a lado (no se pisan al crecer). */
function setupTablero_(ss, sh) {
  var cat = ss.getSheetByName(SH_CATALOGO);
  var lin = ss.getSheetByName(SH_LINEAS);
  function L(hoja, h) { return letraCol_(colDe_(hoja, h)); }
  function todo(hoja) { return hoja.getName() + '!A:' + letraCol_(hoja.getLastColumn()); }
  function cond(col) {
    return '"&IF(OR($B$1="",$B$1="Todos"),""," and ' + col + ' = \'"&$B$1&"\'")&"';
  }
  function fecha(dias) {
    var d = 'TODAY()-' + dias;
    return '"&YEAR(' + d + ')&"-"&TEXT(MONTH(' + d + '),"00")&"-"&TEXT(DAY(' + d + '),"00")&"';
  }
  function query(rango, q) {
    return '=IFERROR(QUERY(' + rango + ',"' + q + '",1),"Sin datos")';
  }
  var l = {
    loc: L(lin, 'Local'), prod: L(lin, 'Producto'), uni: L(lin, 'Unidad'), cant: L(lin, 'Cantidad'),
    prov: L(lin, 'Proveedor'), est: L(lin, 'Estado'), oc: L(lin, 'ID_OC'), rec: L(lin, 'Cantidad_Recibida'),
    frec: L(lin, 'Fecha_Recepcion'), id: L(lin, 'ID_Linea')
  };
  var c = {
    cod: L(cat, 'Código'), prod: L(cat, 'Producto'), loc: L(cat, 'Local'), uni: L(cat, 'Unidad'),
    prov: L(cat, 'Proveedor'), par: L(cat, 'Par'), stock: L(cat, 'Stock_Actual'), conteo: L(cat, 'Ultimo_Conteo'), est: L(cat, 'Estado')
  };
  var bloques = [
    { col: 1, titulo: 'Pendientes de compra por proveedor', f: query(todo(lin),
      'select ' + l.prov + ', ' + l.prod + ', ' + l.uni + ', sum(' + l.cant + ') where ' + l.est + " = 'Pendiente'" + cond(l.loc) +
      ' group by ' + l.prov + ', ' + l.prod + ', ' + l.uni + ' order by ' + l.prov + ', ' + l.prod +
      ' label ' + l.prov + " 'Proveedor', " + l.prod + " 'Producto', " + l.uni + " 'Unidad', sum(" + l.cant + ") 'Cantidad'") },
    { col: 6, titulo: 'Órdenes por recibir', f: query(todo(lin),
      'select ' + l.loc + ', ' + l.prov + ', ' + l.oc + ', count(' + l.id + ') where ' + l.est + " = 'Comprado'" + cond(l.loc) +
      ' group by ' + l.loc + ', ' + l.prov + ', ' + l.oc + ' order by ' + l.loc + ', ' + l.prov +
      ' label ' + l.loc + " 'Local', " + l.prov + " 'Proveedor', " + l.oc + " 'Orden', count(" + l.id + ") 'Líneas'") },
    { col: 11, titulo: 'Productos bajo par', f: query(todo(cat),
      'select ' + c.loc + ', ' + c.prod + ', ' + c.uni + ', ' + c.stock + ', ' + c.par + ', ' + c.prov +
      ' where ' + c.est + " = 'Activo' and " + c.par + ' is not null and ' + c.stock + ' is not null and ' + c.stock + ' < ' + c.par + cond(c.loc) +
      ' order by ' + c.loc + ', ' + c.prod +
      ' label ' + c.loc + " 'Local', " + c.prod + " 'Producto', " + c.uni + " 'Unidad', " + c.stock + " 'Stock', " + c.par + " 'Par', " + c.prov + " 'Proveedor'") },
    { col: 18, titulo: 'Sin conteo en 7 días', f: query(todo(cat),
      'select ' + c.loc + ', ' + c.cod + ', ' + c.prod + ', ' + c.conteo + ' where ' + c.est + " = 'Activo' and (" + c.conteo + ' is null or ' + c.conteo + " < '" + fecha(7) + "')" + cond(c.loc) +
      ' order by ' + c.loc + ', ' + c.prod +
      ' label ' + c.loc + " 'Local', " + c.cod + " 'Código', " + c.prod + " 'Producto', " + c.conteo + " 'Último conteo'") },
    { col: 23, titulo: 'Incompletos de los últimos 14 días', f: query(todo(lin),
      'select ' + l.frec + ', ' + l.loc + ', ' + l.prov + ', ' + l.prod + ', ' + l.uni + ', ' + l.cant + ', ' + l.rec + ', ' + l.oc +
      ' where ' + l.est + " = 'Incompleto' and " + l.frec + " >= '" + fecha(14) + "'" + cond(l.loc) +
      ' order by ' + l.frec + ' desc' +
      ' label ' + l.frec + " 'Recepción', " + l.loc + " 'Local', " + l.prov + " 'Proveedor', " + l.prod + " 'Producto', " +
      l.uni + " 'Unidad', " + l.cant + " 'Pedido', " + l.rec + " 'Recibido', " + l.oc + " 'Orden'") }
  ];
  var AYUDA = 32;
  if (sh.getMaxColumns() < AYUDA) sh.insertColumnsAfter(sh.getMaxColumns(), AYUDA - sh.getMaxColumns());

  sh.getRange(1, 1).setValue('Local');
  sh.getRange(1, 1).setFontWeight('bold');
  var sel = sh.getRange(1, 2);
  if (!str_(sel.getValue())) sel.setValue('Todos');
  sh.getRange(1, AYUDA).setValue('Todos');
  var colLoc = L(ss.getSheetByName(SH_LOCALES), 'Local') || 'A';
  var rLoc = SH_LOCALES + '!' + colLoc + '2:' + colLoc;
  setFormulaLocal_(sh.getRange(2, AYUDA), '=FILTER(' + rLoc + ',' + rLoc + '<>"")');
  sel.setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInRange(sh.getRange(1, AYUDA, 60, 1), true).setAllowInvalid(false)
    .setHelpText('Elegí un local o Todos.').build());
  sh.hideColumns(AYUDA);
  bloques.forEach(function (b) {
    sh.getRange(3, b.col).setValue(b.titulo);
    sh.getRange(3, b.col).setFontWeight('bold');
    setFormulaLocal_(sh.getRange(4, b.col), b.f);
  });
  sh.setFrozenRows(3);
}
