/* ============================== SETUP GREENFRESH ============================== */

/**
 * Corré esta función UNA vez desde el editor de Apps Script.
 * - Agrega los productos de GreenFresh al catálogo (si no existen).
 * - Agrega el encargado GreenFresh a CONFIGURACIÓN (si no existe).
 * - Desactiva Pizzería: marca sus productos como "Inactivo" y su encargado Activo=NO.
 */
function setupGreenFresh() {
  addGreenFreshCatalog_();
  addGreenFreshConfig_();
  deactivatePizzeria_();
  // Nombres reales de los locales
  renameLocal_('Hamburguesería', 'Brooklyn');
  renameLocal_('Parrilla', 'Umo Grill');
  renameLocal_('Heladería', 'Puerto Gelato');
  renameLocal_('Cafetería', 'Trento Café');
  SpreadsheetApp.getActive().toast('Locales renombrados, GreenFresh agregado, Pizzería desactivada', 'Setup OK', 6);
}

/** Renombra un local en CATÁLOGO (Local_Aplicable) y CONFIGURACIÓN (Local). */
function renameLocal_(from, to) {
  var cat = ss_().getSheetByName(SHEET_CATALOGO);
  if (cat) {
    var cv = cat.getDataRange().getValues();
    var head = cv[0].map(function (h) { return String(h).trim().toLowerCase(); });
    var iLocal = idx_(head, ['local_aplicable', 'local']);
    if (iLocal > -1) {
      for (var r = 1; r < cv.length; r++) {
        if (String(cv[r][iLocal] || '').trim().toLowerCase() === from.toLowerCase()) {
          cat.getRange(r + 1, iLocal + 1).setValue(to);
        }
      }
    }
  }
  var cfg = ss_().getSheetByName(SHEET_CONFIG);
  if (cfg) {
    var gv = cfg.getDataRange().getValues();
    for (var i = 0; i < gv.length; i++) {
      var low = gv[i].map(function (c) { return String(c).trim().toLowerCase(); });
      var cL = low.indexOf('local'), cE = low.indexOf('encargado');
      if (cL > -1 && cE > -1) {
        for (var j = i + 1; j < gv.length; j++) {
          var loc = String(gv[j][cL] || '').trim();
          if (!loc) break;
          if (loc.toLowerCase() === from.toLowerCase()) cfg.getRange(j + 1, cL + 1).setValue(to);
        }
        break;
      }
    }
  }
}

function addGreenFreshCatalog_() {
  var sh = ss_().getSheetByName(SHEET_CATALOGO);
  if (!sh) throw new Error('Falta hoja ' + SHEET_CATALOGO);
  var values = sh.getDataRange().getValues();
  var existing = {};
  for (var r = 1; r < values.length; r++) existing[String(values[r][0]).trim()] = true; // por Código
  var hoy = Utilities.formatDate(new Date(), 'America/Argentina/Buenos_Aires', 'yyyy-MM-dd');
  var items = [
    ['GRE001','Pechuga de Pollo','Pechuga fresca','GreenFresh','Proteínas','kg',7000,'Distribuidora Milano',30,15],
    ['GRE002','Mix de Hojas Verdes','Lechuga, rúcula, espinaca','GreenFresh','Vegetales','kg',2200,'Vegetales Frescos',20,10],
    ['GRE003','Quinoa','Quinoa seca','GreenFresh','Granos','kg',5400,'Almacén Natural',15,8],
    ['GRE004','Palta','Palta hass','GreenFresh','Frutas','unidad',900,'Vegetales Frescos',60,30],
    ['GRE005','Tomate Cherry','Tomate cherry','GreenFresh','Vegetales','kg',2600,'Vegetales Frescos',18,9],
    ['GRE006','Huevos','Huevos frescos','GreenFresh','Proteínas','docena',3200,'Granja del Sol',40,20],
    ['GRE007','Arroz Integral','Arroz integral','GreenFresh','Granos','kg',1900,'Almacén Natural',25,12],
    ['GRE008','Batata','Batata','GreenFresh','Vegetales','kg',1500,'Vegetales Frescos',30,15],
    ['GRE009','Garbanzos','Garbanzos secos','GreenFresh','Legumbres','kg',2100,'Almacén Natural',20,10],
    ['GRE010','Salmón','Salmón fresco','GreenFresh','Proteínas','kg',16000,'Pescadería del Puerto',12,6],
    ['GRE011','Aceite de Oliva','Aceite de oliva extra virgen','GreenFresh','Aderezos','litro',8200,'Almacén Natural',15,8],
    ['GRE012','Yogur Natural','Yogur natural sin azúcar','GreenFresh','Lácteos','litro',2400,'Lácteos Premium',24,12]
  ];
  items.forEach(function (it) {
    if (existing[it[0]]) return;
    // Código,Producto,Descripción,Local_Aplicable,Categoría,Unidad_Medida,Precio_Unitario,Proveedor,Stock_Actual,Stock_Mínimo,Estado,Fecha,Notas
    sh.appendRow(it.concat(['Disponible', hoy, '']));
  });
}

function addGreenFreshConfig_() {
  var sh = ss_().getSheetByName(SHEET_CONFIG);
  if (!sh) return;
  var values = sh.getDataRange().getValues();
  var headerRow = -1, cLocal = 0;
  for (var r = 0; r < values.length; r++) {
    var low = values[r].map(function (c) { return String(c).trim().toLowerCase(); });
    if (low.indexOf('local') > -1 && low.indexOf('encargado') > -1) { headerRow = r; cLocal = low.indexOf('local'); break; }
  }
  if (headerRow === -1) return;
  // ¿ya existe GreenFresh?
  for (var i = headerRow + 1; i < values.length; i++) {
    var local = String(values[i][cLocal] || '').trim();
    if (!local) break;
    if (local.toLowerCase() === 'greenfresh') return;
  }
  // insertar fila luego del último encargado
  var insertAt = headerRow + 2;
  for (var k = headerRow + 1; k < values.length; k++) {
    if (!String(values[k][cLocal] || '').trim()) { insertAt = k + 1; break; }
    insertAt = k + 2;
  }
  sh.insertRowBefore(insertAt);
  sh.getRange(insertAt, 1, 1, 6).setValues([['GreenFresh', 'Por asignar', 'greenfresh@pologastronomico.com', '', '10:00-20:00', 'SÍ']]);
}

function deactivatePizzeria_() {
  // Catálogo: marcar productos de Pizzería como Inactivo
  var cat = ss_().getSheetByName(SHEET_CATALOGO);
  if (cat) {
    var cv = cat.getDataRange().getValues();
    var head = cv[0].map(function (h) { return String(h).trim().toLowerCase(); });
    var iLocal = idx_(head, ['local_aplicable', 'local']);
    var iEstado = idx_(head, ['estado']);
    for (var r = 1; r < cv.length; r++) {
      if (String(cv[r][iLocal] || '').trim().toLowerCase() === 'pizzería' && iEstado > -1) {
        cat.getRange(r + 1, iEstado + 1).setValue('Inactivo');
      }
    }
  }
  // Config: encargado Pizzería Activo = NO
  var cfg = ss_().getSheetByName(SHEET_CONFIG);
  if (cfg) {
    var gv = cfg.getDataRange().getValues();
    for (var i = 0; i < gv.length; i++) {
      var low = gv[i].map(function (c) { return String(c).trim().toLowerCase(); });
      var cL = low.indexOf('local'), cE = low.indexOf('encargado');
      if (cL > -1 && cE > -1) {
        var cAct = low.indexOf('activo');
        for (var j = i + 1; j < gv.length; j++) {
          var loc = String(gv[j][cL] || '').trim();
          if (!loc) break;
          if (loc.toLowerCase() === 'pizzería' && cAct > -1) cfg.getRange(j + 1, cAct + 1).setValue('NO');
        }
        break;
      }
    }
  }
}
