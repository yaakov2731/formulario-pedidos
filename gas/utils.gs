/* ============================== UTILS ============================== */

function ss_() {
  // Funciona enlazado (getActive) o standalone (openById con el ID de arriba).
  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  return SpreadsheetApp.openById(SHEET_ID);
}

function getTelegramSettings_() {
  var stores = readTelegramPropertyStores_();
  var flagMatch = findTelegramPropertyValue_(stores, ['TELEGRAM_ENABLED', 'TG_ENABLED']);
  var tokenMatch = findTelegramPropertyValue_(stores, ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_TOKEN', 'BOT_TOKEN']);
  var chatMatch = findTelegramPropertyValue_(stores, ['TELEGRAM_CHAT_ID', 'TELEGRAM_GROUP_ID', 'TELEGRAM_TARGET_CHAT_ID', 'CHAT_ID']);
  var enabledFlag = normalizeTelegramFlag_(flagMatch.value);
  var token = tokenMatch.value;
  var chatId = chatMatch.value;
  var enabled = !!token && !!chatId && enabledFlag !== false;
  var sourceParts = [];
  if (tokenMatch.source) sourceParts.push('token:' + tokenMatch.source + '/' + tokenMatch.key);
  if (chatMatch.source) sourceParts.push('chat:' + chatMatch.source + '/' + chatMatch.key);
  if (flagMatch.source) sourceParts.push('flag:' + flagMatch.source + '/' + flagMatch.key);
  var reason = 'ready';
  if (!token && !chatId) reason = 'missing_token_and_chat_id';
  else if (!token) reason = 'missing_token';
  else if (!chatId) reason = 'missing_chat_id';
  else if (enabledFlag === false) reason = 'telegram_disabled_flag';
  return {
    enabled: enabled,
    token: token,
    chat_id: chatId,
    flag: flagMatch.value,
    source: sourceParts.join(', '),
    reason: reason
  };
}

function readTelegramPropertyStores_() {
  return [
    { name: 'script', values: safePropertyValues_(PropertiesService.getScriptProperties()) },
    { name: 'document', values: safePropertyValues_(PropertiesService.getDocumentProperties()) },
    { name: 'user', values: safePropertyValues_(PropertiesService.getUserProperties()) }
  ];
}

function safePropertyValues_(store) {
  try {
    return store && store.getProperties ? (store.getProperties() || {}) : {};
  } catch (err) {
    return {};
  }
}

function findTelegramPropertyValue_(stores, keys) {
  for (var s = 0; s < stores.length; s++) {
    var store = stores[s];
    for (var k = 0; k < keys.length; k++) {
      var key = keys[k];
      var value = String((store.values && store.values[key]) || '').trim();
      if (!value) continue;
      return {
        value: value,
        key: key,
        source: store.name
      };
    }
  }
  return { value: '', key: '', source: '' };
}

function normalizeTelegramFlag_(value) {
  var raw = String(value || '').trim().toLowerCase();
  if (!raw) return null;
  if (raw === 'false' || raw === '0' || raw === 'no' || raw === 'off' || raw === 'disabled') return false;
  if (raw === 'true' || raw === '1' || raw === 'si' || raw === 'sí' || raw === 'yes' || raw === 'on' || raw === 'enabled') return true;
  return null;
}

function getTelegramStatus_() {
  var settings = getTelegramSettings_();
  var probe = settings.enabled ? probeTelegramTarget_(settings) : { bot_ok: false, chat_ok: false, reason: settings.reason || 'telegram_disabled' };
  return {
    ok: true,
    enabled: settings.enabled,
    has_token: !!settings.token,
    has_chat_id: !!settings.chat_id,
    flag: settings.flag || '',
    source: settings.source || '',
    reason: settings.reason || '',
    bot_ok: probe.bot_ok === true,
    chat_ok: probe.chat_ok === true,
    probe_status: probe.status_code || '',
    probe_reason: probe.reason || ''
  };
}

function probeTelegramTarget_(settings) {
  try {
    var botResponse = UrlFetchApp.fetch('https://api.telegram.org/bot' + settings.token + '/getMe', {
      muteHttpExceptions: true
    });
    var botCode = botResponse.getResponseCode();
    var botBody = parseJsonSafe_(botResponse.getContentText() || '');
    if (botCode < 200 || botCode >= 300 || !botBody || botBody.ok !== true) {
      return { bot_ok: false, chat_ok: false, status_code: botCode, reason: 'bot_probe_failed' };
    }
    var chatResponse = UrlFetchApp.fetch(
      'https://api.telegram.org/bot' + settings.token + '/getChat?chat_id=' + encodeURIComponent(settings.chat_id),
      { muteHttpExceptions: true }
    );
    var chatCode = chatResponse.getResponseCode();
    var chatBody = parseJsonSafe_(chatResponse.getContentText() || '');
    return {
      bot_ok: true,
      chat_ok: chatCode >= 200 && chatCode < 300 && chatBody && chatBody.ok === true,
      status_code: chatCode,
      reason: chatCode >= 200 && chatCode < 300 && chatBody && chatBody.ok === true ? 'ready' : 'chat_probe_failed'
    };
  } catch (err) {
    return { bot_ok: false, chat_ok: false, reason: String(err) };
  }
}

function getOpenAiSettings_() {
  var props = PropertiesService.getScriptProperties().getProperties();
  var enabledFlag = String(props.OPENAI_RECEIPT_AI_ENABLED || '').trim().toLowerCase();
  var apiKey = String(props.OPENAI_API_KEY || '').trim();
  var model = String(props.OPENAI_MODEL || '').trim() || 'gpt-5.4-mini';
  var enabled = !!apiKey && enabledFlag !== 'false' && enabledFlag !== '0' && enabledFlag !== 'no';
  return {
    enabled: enabled,
    api_key: apiKey,
    model: model
  };
}

function setOpenAiConfig(apiKey, model) {
  var props = PropertiesService.getScriptProperties();
  props.setProperties({
    OPENAI_API_KEY: String(apiKey || '').trim(),
    OPENAI_MODEL: String(model || '').trim() || 'gpt-5.4-mini',
    OPENAI_RECEIPT_AI_ENABLED: 'true'
  }, true);
}

function disableOpenAiReceiptParsing() {
  PropertiesService.getScriptProperties().setProperty('OPENAI_RECEIPT_AI_ENABLED', 'false');
}

function setTelegramConfig(botToken, chatId) {
  var props = PropertiesService.getScriptProperties();
  props.setProperties({
    TELEGRAM_BOT_TOKEN: String(botToken || '').trim(),
    TELEGRAM_CHAT_ID: String(chatId || '').trim(),
    TELEGRAM_ENABLED: 'true'
  }, true);
}

function disableTelegramNotifications() {
  PropertiesService.getScriptProperties().setProperty('TELEGRAM_ENABLED', 'false');
}

function notifyTelegramForPedido_(pedido) {
  return notifyTelegramMessage_(pedido, buildTelegramPedidoMessage_(pedido));
}

function notifyTelegramForStock_(stock) {
  return notifyTelegramMessage_(stock, buildTelegramStockMessage_(stock));
}

function notifyTelegramForElaborados_(conteo) {
  return notifyTelegramMessage_(conteo, buildTelegramElaboradosMessage_(conteo));
}

function notifyTelegramMessage_(eventData, messageText) {
  var settings = getTelegramSettings_();
  if (!settings.enabled) {
    var skipped = { ok: false, skipped: true, reason: settings.reason || 'telegram_disabled' };
    appendTelegramLog_(eventData, skipped);
    return skipped;
  }
  try {
    var chunks = splitTelegramMessage_(messageText, 3500);
    var sent = [];
    var ok = true;
    for (var i = 0; i < chunks.length; i++) {
      var part = chunks.length > 1 ? chunks[i] + '\n\n<i>Parte ' + (i + 1) + ' de ' + chunks.length + '</i>' : chunks[i];
      var partResult = sendTelegramChunk_(settings, part);
      sent.push(partResult);
      if (!partResult.ok) {
        ok = false;
        break;
      }
      if (i < chunks.length - 1) Utilities.sleep(120);
    }
    var last = sent.length ? sent[sent.length - 1] : { status_code: '', body: '' };
    var result = {
      ok: ok,
      skipped: false,
      status_code: last.status_code || '',
      body: JSON.stringify({ chunks: chunks.length, sent: sent.length, last: String(last.body || '').slice(0, 300) }).slice(0, 500)
    };
    appendTelegramLog_(eventData, result);
    return result;
  } catch (err) {
    var failed = { ok: false, skipped: false, error: String(err) };
    appendTelegramLog_(eventData, failed);
    return failed;
  }
}

function splitTelegramMessage_(messageText, maxLength) {
  var lines = String(messageText || '').split('\n');
  var chunks = [];
  var current = '';
  lines.forEach(function (line) {
    var candidate = current ? current + '\n' + line : line;
    if (candidate.length <= maxLength) {
      current = candidate;
      return;
    }
    if (current) chunks.push(current);
    current = line.length <= maxLength ? line : line.slice(0, maxLength - 1) + '…';
  });
  if (current) chunks.push(current);
  return chunks.length ? chunks : ['Sin detalle'];
}

function sendTelegramChunk_(settings, text) {
  var url = 'https://api.telegram.org/bot' + settings.token + '/sendMessage';
  var response = UrlFetchApp.fetch(url, {
    method: 'post',
    payload: {
      chat_id: settings.chat_id,
      text: text,
      parse_mode: 'HTML',
      disable_web_page_preview: 'true'
    },
    muteHttpExceptions: true
  });
  var code = response.getResponseCode();
  var raw = response.getContentText() || '';
  var parsed = parseJsonSafe_(raw);
  if (code >= 200 && code < 300 && parsed && parsed.ok === true) {
    return { ok: true, status_code: code, body: raw };
  }
  if (code === 400) {
    var fallback = UrlFetchApp.fetch(url, {
      method: 'post',
      payload: {
        chat_id: settings.chat_id,
        text: stripTelegramHtml_(text),
        disable_web_page_preview: 'true'
      },
      muteHttpExceptions: true
    });
    var fallbackCode = fallback.getResponseCode();
    var fallbackRaw = fallback.getContentText() || '';
    var fallbackParsed = parseJsonSafe_(fallbackRaw);
    return {
      ok: fallbackCode >= 200 && fallbackCode < 300 && fallbackParsed && fallbackParsed.ok === true,
      status_code: fallbackCode,
      body: fallbackRaw
    };
  }
  return { ok: false, status_code: code, body: raw };
}

function stripTelegramHtml_(value) {
  return String(value || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function testTelegramDelivery() {
  return notifyTelegramMessage_({
    id_pedido: 'TEST-' + Utilities.formatDate(new Date(), 'America/Argentina/Buenos_Aires', 'yyyyMMdd-HHmmss'),
    local: 'Sistema'
  }, '✅ <b>Telegram operativo</b>\nPrueba automática de Pedidos Semanales.');
}

function buildTelegramPedidoMessage_(pedido) {
  var local = normalizeLocalName_(pedido.local || '');
  var urgencia = normalizeUrgenciaLabel_(pedido.urgencia || 'Normal');
  var entrega = safeTelegramText_(pedido.fecha_entrega || 'Sin definir');
  var semana = safeTelegramText_(pedido.semana_pedido || 'Sin definir');
  var encargado = safeTelegramText_(pedido.encargado || 'Sin asignar');
  var pedidoId = safeTelegramText_(pedido.id_pedido || '');
  var observaciones = safeTelegramText_(pedido.observaciones || '');
  var totalProductos = String(pedido.total_productos || (pedido.items || []).length || 0);
  var groupedItems = buildTelegramGroupedItems_(pedido.items || []);
  return [
    '🧾 <b>NUEVO PEDIDO — Docks del Puerto</b>',
    '━━━━━━━━━━━━━━━━━━',
    '🏪 <b>Local:</b> ' + safeTelegramText_(local),
    '👤 <b>Encargado:</b> ' + encargado,
    '🆔 <b>ID Pedido:</b> <code>' + pedidoId + '</code>',
    '📅 <b>Semana:</b> ' + semana,
    '🚚 <b>Entrega deseada:</b> ' + entrega,
    '🔴 <b>Urgencia:</b> ' + safeTelegramText_(urgencia),
    '📦 <b>Total items:</b> ' + safeTelegramText_(totalProductos),
    observaciones ? '📝 <b>Observaciones:</b> ' + observaciones : '',
    '',
    '🛒 <b>PRODUCTOS SOLICITADOS</b>',
    '━━━━━━━━━━━━━━━━━━',
    groupedItems
  ].filter(function (line) { return line !== ''; }).join('\n');
}

function buildTelegramStockMessage_(stock) {
  var local = normalizeLocalName_(stock.local || '');
  var encargado = safeTelegramText_(stock.encargado || 'Sin asignar');
  var stockId = safeTelegramText_(stock.id_stock || '');
  var tipoConteo = safeTelegramText_(stock.tipo_conteo || 'Conteo parcial');
  var observaciones = safeTelegramText_(stock.observaciones || '');
  var totalItems = (stock.items || []).filter(function (it) {
    return numberOrNull_(it.stock_actual) !== null;
  }).length;
  var totalCantidad = round2_((stock.items || []).reduce(function (sum, it) {
    return sum + numberOrZero_(it.stock_actual, 0);
  }, 0));
  var lines = (stock.items || []).filter(function (it) {
    return numberOrNull_(it.stock_actual) !== null;
  }).slice(0, 20).map(function (it) {
    return '• ' + safeTelegramText_(it.producto || 'Producto sin nombre') + ' — ' +
      safeTelegramText_(String(numberOrZero_(it.stock_actual, 0)) + ' ' + (it.unidad || 'unidad'));
  });
  return [
    '📦 <b>STOCK ACTUALIZADO — Docks del Puerto</b>',
    '━━━━━━━━━━━━━━━━━━',
    '🏪 <b>Local:</b> ' + safeTelegramText_(local),
    '👤 <b>Encargado:</b> ' + encargado,
    '🆔 <b>ID Stock:</b> <code>' + stockId + '</code>',
    '🧮 <b>Tipo de conteo:</b> ' + tipoConteo,
    '📋 <b>Productos cargados:</b> ' + safeTelegramText_(String(totalItems)),
    '📐 <b>Total relevado:</b> ' + safeTelegramText_(String(totalCantidad)),
    observaciones ? '📝 <b>Observaciones:</b> ' + observaciones : '',
    '',
    '📍 <b>DETALLE</b>',
    '━━━━━━━━━━━━━━━━━━',
    lines.join('\n')
  ].filter(function (line) { return line !== ''; }).join('\n');
}

function buildTelegramElaboradosMessage_(conteo) {
  var local = normalizeLocalName_(conteo.local || '');
  var encargado = safeTelegramText_(conteo.encargado || 'Sin asignar');
  var conteoId = safeTelegramText_(conteo.id_conteo || '');
  var turno = safeTelegramText_(conteo.turno || 'Sin turno');
  var estado = safeTelegramText_(conteo.estado || 'Sobrante');
  var destino = safeTelegramText_(conteo.destino || 'Revisar');
  var observaciones = safeTelegramText_(conteo.observaciones || '');
  var totalItems = (conteo.items || []).filter(function (it) {
    return numberOrNull_(it.cantidad) !== null && numberOrZero_(it.cantidad, 0) > 0;
  }).length;
  var totalCantidad = round2_((conteo.items || []).reduce(function (sum, it) {
    return sum + numberOrZero_(it.cantidad, 0);
  }, 0));
  var lines = (conteo.items || []).filter(function (it) {
    return numberOrNull_(it.cantidad) !== null && numberOrZero_(it.cantidad, 0) > 0;
  }).slice(0, 20).map(function (it) {
    return '• ' + safeTelegramText_(it.producto_elaborado || it.producto || 'Elaborado sin nombre') + ' — ' +
      safeTelegramText_(String(numberOrZero_(it.cantidad, 0)) + ' ' + (it.unidad || 'unidad'));
  });
  return [
    '🍽️ <b>ELABORADOS / SOBRANTE — Docks del Puerto</b>',
    '━━━━━━━━━━━━━━━━━━',
    '🏪 <b>Local:</b> ' + safeTelegramText_(local),
    '👤 <b>Encargado:</b> ' + encargado,
    '🆔 <b>ID Conteo:</b> <code>' + conteoId + '</code>',
    '🕒 <b>Turno:</b> ' + turno,
    '🏷️ <b>Estado:</b> ' + estado,
    '📦 <b>Destino:</b> ' + destino,
    '📋 <b>Productos cargados:</b> ' + safeTelegramText_(String(totalItems)),
    '📐 <b>Total marcado:</b> ' + safeTelegramText_(String(totalCantidad)),
    observaciones ? '📝 <b>Observaciones:</b> ' + observaciones : '',
    '',
    '📍 <b>DETALLE</b>',
    '━━━━━━━━━━━━━━━━━━',
    lines.join('\n')
  ].filter(function (line) { return line !== ''; }).join('\n');
}

function buildTelegramGroupedItems_(items) {
  var maxItems = 20;
  var limitedItems = items.slice(0, maxItems);
  var grouped = {};
  var categoryOrder = [];
  limitedItems.forEach(function (it) {
    var categoriaRaw = String(it.categoria || '').trim();
    var proveedorRaw = String(it.proveedor || '').trim();
    var categoriaKey = categoriaRaw || 'Sin categoria';
    var proveedorKey = proveedorRaw || 'Sin proveedor asignado';
    if (!grouped[categoriaKey]) {
      grouped[categoriaKey] = { providers: {}, providerOrder: [] };
      categoryOrder.push(categoriaKey);
    }
    if (!grouped[categoriaKey].providers[proveedorKey]) {
      grouped[categoriaKey].providers[proveedorKey] = [];
      grouped[categoriaKey].providerOrder.push(proveedorKey);
    }
    grouped[categoriaKey].providers[proveedorKey].push(it);
  });

  var lines = [];
  categoryOrder.forEach(function (categoriaKey, categoryIndex) {
    if (categoryIndex > 0) lines.push('');
    lines.push('📁 <b>' + safeTelegramText_(categoriaKey) + '</b>');
    grouped[categoriaKey].providerOrder.forEach(function (proveedorKey) {
      lines.push('▪️ <b>' + safeTelegramText_(proveedorKey) + '</b>');
      grouped[categoriaKey].providers[proveedorKey].forEach(function (it) {
        var qty = it.cantidad || '';
        var unidad = it.unidad || '';
        var producto = safeTelegramText_(it.producto || 'Producto sin nombre');
        var cantidad = safeTelegramText_(String(qty) + ' ' + unidad).trim();
        lines.push('• ' + producto + ' — ' + cantidad);
      });
    });
  });

  if (items.length > maxItems) {
    if (lines.length) lines.push('');
    lines.push('• +' + (items.length - maxItems) + ' producto(s) adicionales');
  }

  return lines.join('\n').replace(/\n+$/, '');
}

function normalizeUrgenciaLabel_(value) {
  var raw = String(value || '').trim().toLowerCase();
  if (!raw) return 'NORMAL';
  if (raw === 'urgente') return 'URGENTE';
  if (raw === 'alta') return 'ALTA';
  if (raw === 'media') return 'MEDIA';
  if (raw === 'baja') return 'BAJA';
  return String(value || '').trim().toUpperCase();
}

function safeTelegramText_(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function parseJsonSafe_(raw) {
  try {
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}

function extractJsonObjectText_(raw) {
  var text = String(raw || '').trim();
  if (!text) return '';
  if (text.charAt(0) === '{' && text.charAt(text.length - 1) === '}') return text;
  var start = text.indexOf('{');
  var end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return '';
  return text.slice(start, end + 1);
}

function ensureTelegramLogSheet_() {
  var sh = ss_().getSheetByName(SHEET_TELEGRAM_LOG);
  if (sh) return sh;
  sh = ss_().insertSheet(SHEET_TELEGRAM_LOG);
  sh.getRange(1, 1, 1, 8).setValues([[
    'Fecha_Hora', 'ID_Pedido', 'Local', 'Telegram_OK', 'Skipped', 'Status_Code', 'Mensaje', 'Detalle'
  ]]).setFontWeight('bold').setBackground('#355c7d').setFontColor('#ffffff');
  sh.setFrozenRows(1);
  return sh;
}

function appendTelegramLog_(pedido, result) {
  var sh = ensureTelegramLogSheet_();
  var refId = pedido.id_pedido || pedido.id_stock || pedido.id_conteo || pedido.id_produccion || pedido.id_recepcion || '';
  sh.appendRow([
    Utilities.formatDate(new Date(), 'America/Argentina/Buenos_Aires', 'yyyy-MM-dd HH:mm:ss'),
    refId,
    normalizeLocalName_(pedido.local || ''),
    result.ok ? 'SÍ' : 'NO',
    result.skipped ? 'SÍ' : 'NO',
    result.status_code || '',
    result.reason || result.error || '',
    result.body || ''
  ]);
}

function readTelegramLogByPedido_(pedidoId) {
  var sh = ss_().getSheetByName(SHEET_TELEGRAM_LOG);
  if (!sh || sh.getLastRow() < 2) return { configured: getTelegramSettings_().enabled, found: false };
  var values = sh.getDataRange().getValues();
  for (var r = values.length - 1; r >= 1; r--) {
    if (String(values[r][1] || '').trim() !== pedidoId) continue;
    return {
      configured: getTelegramSettings_().enabled,
      found: true,
      fecha_hora: values[r][0] || '',
      ok: String(values[r][3] || '').trim().toUpperCase() === 'SÍ',
      skipped: String(values[r][4] || '').trim().toUpperCase() === 'SÍ',
      status_code: values[r][5] || '',
      message: values[r][6] || '',
      detail: values[r][7] || ''
    };
  }
  return { configured: getTelegramSettings_().enabled, found: false };
}

function buildPedidoPayloadFromSheets_(pedidoId) {
  pedidoId = String(pedidoId || '').trim();
  if (!pedidoId) return null;
  var pedido = findPedidoRowById_(pedidoId);
  if (!pedido) return null;
  var detalle = findDetalleRowsByPedidoId_(pedidoId);
  return {
    id_pedido: pedido[0] || '',
    fecha_hora: pedido[1] || '',
    local: pedido[2] || '',
    encargado: pedido[3] || '',
    semana_pedido: pedido[4] || '',
    email_encargado: pedido[5] || '',
    estado: pedido[6] || '',
    urgencia: pedido[7] || 'Normal',
    productos_solicitados: pedido[8] || '',
    total_productos: pedido[9] || detalle.length || 0,
    total_estimado: pedido[10] || '',
    fecha_entrega: pedido[11] || '',
    observaciones: pedido[12] || '',
    proveedor_asignado: pedido[13] || '',
    comprado: pedido[14] || 'NO',
    entregado: pedido[15] || 'NO',
    notas_gerencia: pedido[16] || '',
    items: detalle.map(function (row) {
      return {
        codigo: row[6] || '',
        producto: row[7] || '',
        categoria: row[8] || '',
        cantidad: row[9] || '',
        unidad: row[10] || '',
        proveedor: row[11] || ''
      };
    })
  };
}

function buildPedidoPayloadFromDetalle_(pedidoId) {
  pedidoId = String(pedidoId || '').trim();
  if (!pedidoId) return null;
  var detalle = findDetalleRowsByPedidoId_(pedidoId);
  if (!detalle.length) return null;
  var first = detalle[0];
  var proveedores = {};
  var productosTexto = [];
  detalle.forEach(function (row) {
    var producto = String(row[7] || '').trim();
    var cantidad = String(row[9] || '').trim();
    var unidad = String(row[10] || '').trim();
    var proveedor = String(row[11] || '').trim();
    if (producto) {
      productosTexto.push(producto + (cantidad ? ' - ' + cantidad + (unidad ? ' ' + unidad : '') : ''));
    }
    if (proveedor) proveedores[proveedor] = true;
  });
  return {
    id_pedido: pedidoId,
    fecha_hora: first[1] || '',
    local: first[3] || '',
    encargado: first[4] || '',
    semana_pedido: first[2] || '',
    email_encargado: '',
    estado: 'Recibido',
    urgencia: first[5] || 'Normal',
    productos_solicitados: productosTexto.join(', '),
    total_productos: detalle.length,
    total_estimado: '',
    fecha_entrega: '',
    observaciones: 'Pedido reconstruido desde PEDIDOS_DETALLE para reenvio Telegram',
    proveedor_asignado: Object.keys(proveedores).join(', '),
    comprado: 'NO',
    entregado: 'NO',
    notas_gerencia: '',
    items: detalle.map(function (row) {
      return {
        codigo: row[6] || '',
        producto: row[7] || '',
        categoria: row[8] || '',
        cantidad: row[9] || '',
        unidad: row[10] || '',
        proveedor: row[11] || ''
      };
    })
  };
}

function resendTelegramForPedido_(pedidoId) {
  var pedido = buildPedidoPayloadFromSheets_(pedidoId) || buildPedidoPayloadFromDetalle_(pedidoId);
  if (!pedido) return { ok: false, error: 'No encontré el pedido ' + pedidoId };
  return notifyTelegramForPedido_(pedido);
}

function idx_(headerLower, names) {
  for (var i = 0; i < names.length; i++) {
    var p = headerLower.indexOf(names[i]);
    if (p > -1) return p;
  }
  return -1;
}

function isActiveFlag_(value) {
  var normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return true;
  return normalized === 'sí' || normalized === 'si' || normalized === 's' ||
    normalized === 'yes' || normalized === 'y' || normalized === 'true' || normalized === '1';
}

function keyFor_(local, codigo, nombre) {
  return normalizeLocalName_(local).toLowerCase() + '||' +
    (String(codigo || '').trim().toLowerCase() || String(nombre || '').trim().toLowerCase());
}

function normalizeLocalName_(local) {
  var value = String(local || '').trim();
  if (!value) return '';
  var low = value.toLowerCase();
  if (low === 'hamburguesería' || low === 'hamburgueseria') return 'Brooklyn';
  if (low === 'parrilla') return 'Umo Grill';
  if (low === 'heladería' || low === 'heladeria') return 'Puerto Gelato';
  if (low === 'cafetería' || low === 'cafeteria') return 'Trento Café';
  return value;
}

function normalizeLooseText_(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function catalogForLocal_(local) {
  var catalog = readCatalog_();
  return catalog[normalizeLocalName_(local)] || [];
}

function scoreReceiptCatalogMatch_(candidate, item) {
  var lineNorm = normalizeLooseText_(candidate);
  var itemNorm = normalizeLooseText_(item.nombre || '');
  if (!lineNorm || !itemNorm) return 0;
  var score = 0;
  if (lineNorm.indexOf(itemNorm) > -1) score += 12;
  var itemTokens = itemNorm.split(' ').filter(function (token) { return token.length > 2; });
  var lineTokens = {};
  lineNorm.split(' ').forEach(function (token) {
    if (token.length > 2) lineTokens[token] = true;
  });
  itemTokens.forEach(function (token) {
    if (lineTokens[token]) score += 3;
  });
  var provNorm = normalizeLooseText_(item.proveedor || '');
  if (provNorm && lineNorm.indexOf(provNorm) > -1) score += 2;
  return score;
}

function resolveCatalogItemForAi_(match, catalog) {
  var code = String(match && match.codigo || '').trim().toLowerCase();
  var product = String(match && (match.producto || match.nombre) || '').trim();
  var productNorm = normalizeLooseText_(product);
  var best = null;
  var bestScore = 0;
  for (var i = 0; i < catalog.length; i++) {
    var item = catalog[i];
    if (code && String(item.codigo || '').trim().toLowerCase() === code) return item;
    var score = 0;
    if (productNorm) score = scoreReceiptCatalogMatch_(product, item);
    if (score > bestScore) {
      best = item;
      bestScore = score;
    }
  }
  return bestScore >= 6 ? best : null;
}

function sanitizeAiReceiptMatches_(parsed, local) {
  var catalog = catalogForLocal_(local);
  var grouped = {};
  var unknownGrouped = {};
  var list = parsed && parsed.matches instanceof Array ? parsed.matches : [];
  for (var i = 0; i < list.length; i++) {
    var raw = list[i] || {};
    var item = resolveCatalogItemForAi_(raw, catalog);
    var qty = numberOrNull_(raw.cantidad_recibida);
    if (!(qty > 0)) continue;
    if (!item) {
      var unknownName = String(raw.producto || raw.nombre || raw.detalle || raw.sourceLine || raw.linea || '').trim();
      if (!unknownName) continue;
      var unknownKey = normalizeLooseText_(unknownName);
      if (!unknownGrouped[unknownKey]) {
        unknownGrouped[unknownKey] = {
          producto: unknownName,
          unidad: String(raw.unidad || 'unidad').trim() || 'unidad',
          categoria: String(raw.categoria || '').trim(),
          proveedor: String(raw.proveedor || parsed.proveedor || '').trim(),
          cantidad_recibida: 0,
          score: numberOrZero_(raw.score, 0),
          sourceLine: String(raw.sourceLine || raw.linea || raw.detalle || unknownName).trim()
        };
      }
      unknownGrouped[unknownKey].cantidad_recibida += qty;
      if (numberOrZero_(raw.score, 0) > numberOrZero_(unknownGrouped[unknownKey].score, 0)) {
        unknownGrouped[unknownKey].score = numberOrZero_(raw.score, 0);
      }
      continue;
    }
    var key = keyFor_(local, item.codigo || '', item.nombre || '');
    if (!grouped[key]) {
      grouped[key] = {
        key: key,
        codigo: item.codigo || '',
        producto: item.nombre || '',
        categoria: item.categoria || '',
        unidad: item.unidad || 'unidad',
        proveedor: item.proveedor || '',
        cantidad_recibida: 0,
        score: numberOrZero_(raw.score, 12),
        sourceLine: String(raw.sourceLine || raw.linea || raw.detalle || item.nombre || '').trim()
      };
    }
    grouped[key].cantidad_recibida += qty;
    if (raw.sourceLine || raw.linea || raw.detalle) {
      grouped[key].sourceLine = String(raw.sourceLine || raw.linea || raw.detalle || '').trim();
    }
  }
  var matches = Object.keys(grouped).map(function (key) {
    var row = grouped[key];
    row.cantidad_recibida = numberOrBlank_(row.cantidad_recibida);
    return row;
  }).sort(function (a, b) { return numberOrZero_(b.score) - numberOrZero_(a.score); });
  var unknown_items = Object.keys(unknownGrouped).map(function (key) {
    var row = unknownGrouped[key];
    row.cantidad_recibida = numberOrBlank_(row.cantidad_recibida);
    return row;
  }).sort(function (a, b) { return numberOrZero_(b.score) - numberOrZero_(a.score); });
  var proveedor = String(parsed && parsed.proveedor || '').trim();
  return {
    rawText: String(parsed && parsed.rawText || '').trim(),
    matches: matches,
    unknown_items: unknown_items,
    proveedor: proveedor
  };
}

function openAiResponseText_(payload, settings) {
  var response = UrlFetchApp.fetch('https://api.openai.com/v1/responses', {
    method: 'post',
    contentType: 'application/json',
    headers: {
      Authorization: 'Bearer ' + settings.api_key
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  var code = response.getResponseCode();
  var raw = response.getContentText() || '';
  if (code < 200 || code >= 300) {
    throw new Error('OpenAI HTTP ' + code + ': ' + raw.slice(0, 400));
  }
  var parsed = parseJsonSafe_(raw);
  if (!parsed) throw new Error('OpenAI devolvió JSON inválido');
  if (parsed.output_text) return String(parsed.output_text);
  if (parsed.output instanceof Array) {
    for (var i = 0; i < parsed.output.length; i++) {
      var item = parsed.output[i];
      if (!item || !(item.content instanceof Array)) continue;
      for (var j = 0; j < item.content.length; j++) {
        var content = item.content[j];
        if (content && typeof content.text === 'string' && content.text.trim()) {
          return content.text;
        }
      }
    }
  }
  throw new Error('OpenAI no devolvió texto utilizable');
}

function isReceiptNoiseLine_(line) {
  var lower = String(line || '').toLowerCase();
  if (!lower) return true;
  if (lower.length < 4) return true;
  if (/\b(total|subtotal|iva|descuento|recargo|cambio|efectivo|tarjeta|debito|credito|transferencia|pago|abonado|saldo|vuelto|cajero|cliente|mesa|pedido|comprobante|factura|ticket|remito|fecha|hora|cuit|cuil|direccion|domicilio|telefono|tel|gracias|pagina)\b/.test(lower)) return true;
  if (/^\d{1,2}[\/-]\d{1,2}([\/-]\d{2,4})?$/.test(lower)) return true;
  return false;
}

function isReceiptStopLine_(line) {
  var lower = String(line || '').toLowerCase();
  if (!lower) return false;
  return /\b(subtotal|total final|total|saldo|neto|per iva|per iibb|vencimientos|observaciones|cae|son pesos|firma|aclaracion|dni|importe total en letras)\b/.test(lower);
}

function looksLikeReceiptHeaderLine_(line) {
  var lower = String(line || '').toLowerCase();
  return /\b(articulo|articulos|producto|productos|descripcion|detalle|cant|cantidad|precio|p unit|punit|unitario|importe)\b/.test(lower);
}

function looksLikeReceiptContinuationLine_(line) {
  var lower = String(line || '').toLowerCase();
  if (!lower || isReceiptNoiseLine_(lower) || isReceiptStopLine_(lower)) return false;
  if (/\d/.test(lower)) return false;
  return /[a-z]/.test(lower) && lower.length >= 6;
}

function looksLikeReceiptItemLine_(line) {
  var lower = String(line || '').toLowerCase();
  if (!lower || isReceiptNoiseLine_(lower) || isReceiptStopLine_(lower)) return false;
  if (!/[a-z]/.test(lower)) return false;
  var nums = lower.match(/\d+(?:[.,]\d+)?/g) || [];
  var hasMoneyHint = /\$\s*\d|\b\d+(?:[.,]\d+)?\s*(?:c\/u|cu)\b/.test(lower);
  var hasQtyOrAmountHint = /\b\d+(?:[.,]\d+)?\s*(?:kg|kilo|kilos|gr|g|lt|lts|l|un|u|unidad|unidades|doc|pack|paq|bolsa|caja)\b/.test(lower);
  if (nums.length >= 3) return true;
  if (nums.length >= 2 && (hasMoneyHint || hasQtyOrAmountHint)) return true;
  return false;
}

function extractReceiptTableLines_(text) {
  var lines = String(text || '').split(/\r?\n/).map(function (line) {
    return String(line || '').trim();
  }).filter(Boolean);
  var out = [];
  var inTable = false;
  lines.forEach(function (line) {
    if (looksLikeReceiptHeaderLine_(line)) {
      inTable = true;
      return;
    }
    if (!inTable) return;
    if (isReceiptStopLine_(line)) {
      inTable = false;
      return;
    }
    if (looksLikeReceiptItemLine_(line) || looksLikeReceiptContinuationLine_(line)) out.push(line);
  });
  return out;
}

function filterReceiptOcrText_(text) {
  var tableLines = extractReceiptTableLines_(text);
  var fallback = String(text || '').split(/\r?\n/).map(function (line) {
    return String(line || '').trim();
  }).filter(function (line) {
    return looksLikeReceiptHeaderLine_(line) || looksLikeReceiptItemLine_(line);
  });
  var filtered = tableLines.length ? tableLines : fallback;
  return filtered.join('\n');
}

function parseReceiptTextAi_(local, text) {
  local = normalizeLocalName_(local);
  text = String(text || '').trim();
  if (!local) return { ok: false, error: 'Falta local' };
  if (!text) return { ok: false, error: 'Falta texto OCR' };
  text = filterReceiptOcrText_(text) || text;
  var settings = getOpenAiSettings_();
  if (!settings.enabled) return { ok: false, disabled: true, error: 'openai_disabled' };
  var catalog = catalogForLocal_(local);
  if (!catalog.length) return { ok: false, error: 'Catálogo vacío para ' + local };
  var compactCatalog = catalog.map(function (item) {
    return {
      codigo: item.codigo || '',
      producto: item.nombre || '',
      unidad: item.unidad || 'unidad',
      categoria: item.categoria || '',
      proveedor: item.proveedor || ''
    };
  });
  var prompt = [
    'Local: ' + local,
    'Catalogo permitido (usar solo estos productos): ' + JSON.stringify(compactCatalog),
    'Texto OCR de la boleta/remito:',
    text,
    'Devolve solo JSON valido con esta forma exacta:',
    '{"proveedor":"","matches":[{"codigo":"","producto":"","cantidad_recibida":0,"sourceLine":"","score":0}],"unknown_items":[{"producto":"","cantidad_recibida":0,"unidad":"unidad","categoria":"","proveedor":"","sourceLine":"","score":0}]}',
    'Reglas:',
    '- trabajar solo con lineas de items que parezcan articulo/producto + precio + cantidad + importe',
    '- ignorar encabezados, totales, subtotales, iva, fechas, cuit, medios de pago, observaciones y cualquier texto administrativo',
    '- usar solo productos del catalogo entregado dentro de matches',
    '- si detectas productos de la foto que no estan en el catalogo, ponerlos en unknown_items',
    '- si una linea tiene cantidad pero no podes mapearla con confianza alta al catalogo, debe ir a unknown_items',
    '- no omitas productos legibles solo porque no estan en el catalogo',
    '- consolidar duplicados',
    '- cantidad_recibida debe ser numerica y mayor a 0',
    '- si no estas seguro, no inventes coincidencias',
    '- score es 0 a 100 segun confianza',
    '- solo usar matches cuando la coincidencia sea profesionalmente defendible; si no, preferir unknown_items'
  ].join('\n');
  var rawText = openAiResponseText_({
    model: settings.model,
    reasoning: { effort: 'low' },
    input: [
      {
        role: 'system',
        content: [
          {
            type: 'input_text',
            text: 'Sos un extractor operativo de recepciones de mercaderia. Solo tenes que leer lineas de items con estructura articulo o producto, precio, cantidad e importe. Ignora por completo totales, subtotales, IVA, fechas, CUIT, medios de pago y cualquier texto fuera del detalle de items. Tu trabajo es mapear OCR ruidoso a un catalogo fijo y devolver solo JSON. Si detectas un producto legible que no coincide con suficiente confianza con el catalogo, no lo descartes: devolvelo en unknown_items.'
          }
        ]
      },
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: prompt
          }
        ]
      }
    ]
  }, settings);
  var parsed = parseJsonSafe_(extractJsonObjectText_(rawText));
  if (!parsed) throw new Error('No pude parsear la respuesta JSON de OpenAI');
  var sanitized = sanitizeAiReceiptMatches_(parsed, local);
  sanitized.rawText = text;
  return {
    ok: true,
    model: settings.model,
    proveedor: sanitized.proveedor,
    matches: sanitized.matches,
    unknown_items: sanitized.unknown_items,
    rawText: sanitized.rawText
  };
}

function latestStockMap_() {
  var sh = ss_().getSheetByName(SHEET_STOCK);
  if (!sh || sh.getLastRow() < 2) return {};
  var values = sh.getDataRange().getValues();
  var out = {};
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var local = row[2], codigo = row[5], producto = row[6];
    out[keyFor_(local, codigo, producto)] = {
      fecha_hora: row[1],
      tipo_conteo: row[4],
      stock_real: numberOrZero_(row[9], 0)
    };
  }
  return out;
}

function pendingDemandMap_() {
  return pendingDemandSummary_().demandMap;
}

function pendingDemandSummary_() {
  var sh = ss_().getSheetByName(SHEET_DETALLE);
  if (!sh || sh.getLastRow() < 2) return { demandMap: {}, activeRows: [] };
  var values = sh.getDataRange().getValues();
  var out = {};
  var activeRows = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var estado = String(row[12] || '').trim().toLowerCase();
    if (estado === 'entregado' || estado === 'cancelado') continue;
    activeRows.push(row.slice(0, DETALLE_HEADERS.length));
    var key = keyFor_(row[3], row[6], row[7]);
    if (!out[key]) out[key] = { cantidad: 0, pedidos: 0 };
    out[key].cantidad += numberOrZero_(row[9], 0);
    out[key].pedidos += 1;
  }
  return { demandMap: out, activeRows: activeRows };
}

function computeOperationalSnapshot_() {
  var catalog = readCatalog_();
  var stockMap = latestStockMap_();
  var demandSummary = pendingDemandSummary_();
  var demandMap = demandSummary.demandMap;
  var recepcion = readRecepcionResumen_();
  var produccion = readProduccionResumen_();
  var elaborados = readElaboradosResumen_();
  var records = [];
  var localSummary = {};
  var totalProductos = 0;
  var totalConConteo = 0;
  var totalSinStock = 0;
  var totalFaltantes = 0;
  var totalPedidoCantidad = 0;
  var localesConRiesgo = 0;

  Object.keys(catalog).forEach(function (local) {
    var localRisk = false;
    (catalog[local] || []).forEach(function (item) {
      var key = keyFor_(local, item.codigo, item.nombre);
      var stockRec = stockMap[key] || {};
      var demandRec = demandMap[key] || { cantidad: 0, pedidos: 0 };
      var stockReal = numberOrZero_(stockRec.stock_real, item.stock_actual);
      var pedidosPend = numberOrZero_(demandRec.cantidad, 0);
      var saldo = round2_(stockReal - pedidosPend);
      var status = saldo < 0 ? 'Faltante' : (stockReal <= 0 ? 'Sin stock' : (pedidosPend > 0 ? 'Cubierto' : 'Disponible'));
      records.push([
        local,
        item.codigo || '',
        item.nombre || '',
        item.categoria || '',
        item.unidad || '',
        stockReal,
        demandRec.pedidos || 0,
        pedidosPend,
        saldo,
        status,
        stockRec.tipo_conteo || '',
        stockRec.fecha_hora || ''
      ]);

      totalProductos += 1;
      totalPedidoCantidad += pedidosPend;
      if (stockReal > 0) totalConConteo += 1;
      if (stockReal <= 0) totalSinStock += 1;
      if (saldo < 0) {
        totalFaltantes += 1;
        localRisk = true;
      }

      if (!localSummary[local]) localSummary[local] = { productos: 0, conStock: 0, sinStock: 0, pedidos: 0, faltantes: 0 };
      localSummary[local].productos += 1;
      if (stockReal > 0) localSummary[local].conStock += 1; else localSummary[local].sinStock += 1;
      localSummary[local].pedidos += demandRec.pedidos || 0;
      if (saldo < 0) localSummary[local].faltantes += 1;
    });
    if (localRisk) localesConRiesgo += 1;
  });

  return {
    catalog: catalog,
    records: records,
    localSummary: localSummary,
    totalProductos: totalProductos,
    totalConConteo: totalConConteo,
    totalSinStock: totalSinStock,
    totalFaltantes: totalFaltantes,
    totalPedidoCantidad: round2_(totalPedidoCantidad),
    totalPedidosAbiertos: demandSummary.activeRows.length,
    activeRows: demandSummary.activeRows,
    localesConRiesgo: localesConRiesgo
    ,
    totalRecepcionMovimientos: recepcion.total_movimientos || 0,
    totalRecepcionCantidad: Object.keys(recepcion.byLocal).reduce(function (sum, local) {
      return sum + numberOrZero_(recepcion.byLocal[local].cantidad, 0);
    }, 0),
    totalProduccionMovimientos: produccion.total_movimientos || 0,
    totalProduccionCantidad: Object.keys(produccion.byLocal).reduce(function (sum, local) {
      return sum + numberOrZero_(produccion.byLocal[local].cantidad_producida, 0);
    }, 0),
    totalElaboradosMovimientos: elaborados.total_movimientos || 0,
    totalElaboradosCantidad: Object.keys(elaborados.byLocal).reduce(function (sum, local) {
      return sum + numberOrZero_(elaborados.byLocal[local].cantidad, 0);
    }, 0)
  };
}

function buildFrontendOperationalSnapshot_() {
  var snap = computeOperationalSnapshot_();
  return {
    generated_at: Utilities.formatDate(new Date(), 'America/Argentina/Buenos_Aires', 'yyyy-MM-dd HH:mm:ss'),
    totals: {
      productos: snap.totalProductos,
      con_stock: snap.totalConConteo,
      sin_stock: snap.totalSinStock,
      faltantes: snap.totalFaltantes,
      pedidos_abiertos: snap.totalPedidosAbiertos,
      cantidad_pedida: snap.totalPedidoCantidad,
      locales_con_riesgo: snap.localesConRiesgo,
      recepciones: snap.totalRecepcionMovimientos,
      produccion: snap.totalProduccionMovimientos,
      elaborados: snap.totalElaboradosMovimientos
    },
    byLocal: snap.localSummary,
    openItemsByLocal: buildOpenItemsByLocalFromRows_(snap.activeRows || [])
  };
}

function buildOpenItemsByLocal_() {
  return buildOpenItemsByLocalFromRows_(activePedidoRows_());
}

function buildOpenItemsByLocalFromRows_(rows) {
  var out = {};
  rows.forEach(function (row) {
    var local = normalizeLocalName_(row[3]);
    if (local === 'Pizzería') return;
    if (!local) return;
    if (!out[local]) out[local] = [];
    out[local].push({
      fecha_hora: row[1],
      semana: row[2],
      producto: row[7],
      cantidad: numberOrZero_(row[9], 0),
      unidad: row[10] || '',
      proveedor: row[11] || '',
      urgencia: row[5] || 'Normal',
      estado: row[12] || 'Pendiente'
    });
  });
  Object.keys(out).forEach(function (local) {
    out[local] = out[local]
      .sort(function (a, b) { return comparableDateTime_(b.fecha_hora) - comparableDateTime_(a.fecha_hora); })
      .slice(0, 8);
  });
  return out;
}

function activePedidoRows_() {
  return pendingDemandSummary_().activeRows;
}

function recepcionRows_() {
  var sh = ss_().getSheetByName(SHEET_RECEPCION);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getDataRange().getValues().slice(1).reverse();
}

function produccionRows_() {
  var sh = ss_().getSheetByName(SHEET_PRODUCCION);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getDataRange().getValues().slice(1).reverse();
}

function elaboradosRows_() {
  var sh = ss_().getSheetByName(SHEET_ELABORADOS);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getDataRange().getValues().slice(1).reverse();
}

function comprasRows_() {
  var catalog = readCatalog_();
  var demandMap = pendingDemandMap_();
  var bucket = {};
  Object.keys(catalog).forEach(function (local) {
    (catalog[local] || []).forEach(function (item) {
      var demand = demandMap[keyFor_(local, item.codigo, item.nombre)];
      if (!demand || !demand.cantidad) return;
      var key = [item.proveedor || 'Sin proveedor', item.categoria || '', item.nombre || '', item.unidad || ''].join('||');
      if (!bucket[key]) {
        bucket[key] = {
          proveedor: item.proveedor || 'Sin proveedor',
          categoria: item.categoria || '',
          producto: item.nombre || '',
          unidad: item.unidad || '',
          cantidad: 0,
          locales: {}
        };
      }
      bucket[key].cantidad += numberOrZero_(demand.cantidad, 0);
      bucket[key].locales[local] = true;
    });
  });
  return Object.keys(bucket).sort().map(function (key) {
    var rec = bucket[key];
    return [rec.proveedor, rec.categoria, rec.producto, rec.unidad, round2_(rec.cantidad), Object.keys(rec.locales).sort().join(', ')];
  });
}

function topUrgentRows_(limit) {
  var rows = activePedidoRows_().filter(function (row) {
    return String(row[5] || '').trim().toLowerCase() === 'urgente';
  }).slice(0, limit || 8);
  return rows.map(function (row) {
    return [row[3], row[7], row[9], row[5]];
  });
}

function latestStockRows_(limit) {
  var sh = ss_().getSheetByName(SHEET_STOCK);
  if (!sh || sh.getLastRow() < 2) return [];
  var values = sh.getDataRange().getValues();
  var rows = values.slice(1).reverse().slice(0, limit || 8);
  return rows.map(function (row) {
    return [row[1], row[2], row[6], row[4]];
  });
}

function latestOpsRows_(limit) {
  var recep = readRecepcionResumen_().latest.map(function (row) {
    return {
      stamp: comparableDateTime_(row.fecha_hora),
      values: [row.fecha_hora, row.local, 'Recepción', row.producto + ' · ' + row.cantidad_recibida + ' ' + row.unidad]
    };
  });
  var prod = readProduccionResumen_().latest.map(function (row) {
    return {
      stamp: comparableDateTime_(row.fecha_hora),
      values: [row.fecha_hora, row.local, 'Producción', (row.producto_elaborado || row.insumo) + ' · lote ' + (row.lote || '—')]
    };
  });
  var elab = readElaboradosResumen_().latest.map(function (row) {
    return {
      stamp: comparableDateTime_(row.fecha_hora),
      values: [row.fecha_hora, row.local, 'Elaborados', row.producto_elaborado + ' · ' + row.cantidad + ' ' + row.unidad]
    };
  });
  return recep.concat(prod).concat(elab)
    .sort(function (a, b) { return b.stamp - a.stamp; })
    .slice(0, limit || 8)
    .map(function (row) { return row.values; });
}

function operationalLocals_() {
  var catalog = readCatalog_();
  var config = readConfig_();
  var demandRows = activePedidoRows_();
  var recep = readRecepcionResumen_().byLocal || {};
  var prod = readProduccionResumen_().byLocal || {};
  var elab = readElaboradosResumen_().byLocal || {};
  var map = {};

  Object.keys(catalog).forEach(function (local) { map[local] = true; });
  Object.keys(config).forEach(function (local) { map[local] = true; });
  Object.keys(recep).forEach(function (local) { map[local] = true; });
  Object.keys(prod).forEach(function (local) { map[local] = true; });
  Object.keys(elab).forEach(function (local) { map[local] = true; });
  demandRows.forEach(function (row) {
    var local = normalizeLocalName_(row[3]);
    if (local) map[local] = true;
  });

  return Object.keys(map).sort();
}

function localSheetName_(prefix, local) {
  return sanitizeSheetName_(prefix + local);
}

function sanitizeSheetName_(value) {
  return String(value || '')
    .replace(/[\\\/\?\*\[\]:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 99);
}

function ensureSheet_(name) {
  return ss_().getSheetByName(name) || ss_().insertSheet(name);
}

function applyCatalogColumnUpdates_(sh, values, changedRows, iStock, iFecha, iNotas, changedStock, changedFecha, changedNotas) {
  if (!values || values.length < 2 || !changedRows || !changedRows.length) return;
  var rowGroups = contiguousRowGroups_(changedRows);
  rowGroups.forEach(function (group) {
    if (changedStock && iStock > -1) {
      sh.getRange(group.start, iStock + 1, group.length, 1).setValues(values.slice(group.start - 1, group.start - 1 + group.length).map(function (row) { return [row[iStock]]; }));
    }
    if (changedFecha && iFecha > -1) {
      sh.getRange(group.start, iFecha + 1, group.length, 1).setValues(values.slice(group.start - 1, group.start - 1 + group.length).map(function (row) { return [row[iFecha]]; }));
    }
    if (changedNotas && iNotas > -1) {
      sh.getRange(group.start, iNotas + 1, group.length, 1).setValues(values.slice(group.start - 1, group.start - 1 + group.length).map(function (row) { return [row[iNotas]]; }));
    }
  });
}

function contiguousRowGroups_(rows) {
  if (!rows || !rows.length) return [];
  var sorted = rows.slice().sort(function (a, b) { return a - b; });
  var groups = [];
  var start = sorted[0];
  var prev = sorted[0];
  for (var i = 1; i < sorted.length; i++) {
    if (sorted[i] === prev || sorted[i] === prev + 1) {
      prev = sorted[i];
      continue;
    }
    groups.push({ start: start, length: prev - start + 1 });
    start = sorted[i];
    prev = sorted[i];
  }
  groups.push({ start: start, length: prev - start + 1 });
  return groups;
}

function clearPresentationSheet_(sh, cols) {
  sh.clear();
  sh.clearConditionalFormatRules();
  sh.clearNotes();
  sh.setHiddenGridlines(true);
  sh.setFrozenRows(0);
  sh.setFrozenColumns(0);
  if (cols && cols > 0) {
    for (var c = 1; c <= cols; c++) sh.setColumnWidth(c, 140);
  }
}

/**
 * Deja todas las hojas operativas listas para imprimir con texto legible.
 * Google Sheets calcula los cortes entre filas; el ajuste de texto y la altura
 * automática evitan que un registro quede recortado al cambiar de página.
 */
function prepareOperationalSheetsForPrint() {
  applyPrintLayoutToOperationalSheets_();
  SpreadsheetApp.getActive().toast(
    'Hojas operativas preparadas en 14 pt con filas completas y encabezados congelados',
    'Impresión lista',
    6
  );
}

function applyPrintLayoutToOperationalSheets_() {
  var ss = ss_();
  ss.getSheets().forEach(function (sh) {
    if (!isPrintableOperationalSheet_(sh.getName())) return;
    applyPrintLayoutToSheet_(sh);
  });
}

function isPrintableOperationalSheet_(sheetName) {
  var printableNames = [
    SHEET_HOME,
    SHEET_STOCK_DASH,
    SHEET_VIEW_PED,
    SHEET_VIEW_STK,
    SHEET_VIEW_BUY,
    SHEET_VIEW_REC,
    SHEET_VIEW_PROD,
    SHEET_VIEW_ELAB,
    SHEET_REPORT_ELAB,
    SHEET_RESUMEN,
    SHEET_PEDIDOS,
    SHEET_DETALLE,
    SHEET_STOCK,
    SHEET_RECEPCION,
    SHEET_PRODUCCION,
    SHEET_ELABORADOS
  ];
  return printableNames.indexOf(sheetName) !== -1 ||
    sheetName.indexOf(SHEET_LOCAL_PED_PREFIX) === 0 ||
    sheetName.indexOf(SHEET_LOCAL_STK_PREFIX) === 0;
}

function applyPrintLayoutToSheet_(sh) {
  var lastRow = sh.getLastRow();
  var lastColumn = sh.getLastColumn();
  if (lastRow < 1 || lastColumn < 1) return;

  var usedRange = sh.getRange(1, 1, lastRow, lastColumn);
  usedRange
    .setFontSize(PRINT_FONT_SIZE)
    .setVerticalAlignment('middle')
    .setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);

  // Los títulos conservan jerarquía visual, pero ningún texto baja de 14 pt.
  sh.getRange(1, 1, 1, lastColumn).setFontSize(18).setFontWeight('bold');
  if (lastRow >= 2) sh.getRange(2, 1, 1, lastColumn).setFontSize(PRINT_FONT_SIZE);

  // Al imprimir con "Repetir filas congeladas", el encabezado acompaña cada página.
  if (sh.getFrozenRows() === 0) sh.setFrozenRows(1);
  sh.autoResizeRows(1, lastRow);
}

function normalizeLegacyLocalNames_() {
  var renameSpecs = [
    { from: 'Hamburguesería', to: 'Brooklyn' },
    { from: 'Hamburgueseria', to: 'Brooklyn' },
    { from: 'Parrilla', to: 'Umo Grill' },
    { from: 'Heladería', to: 'Puerto Gelato' },
    { from: 'Heladeria', to: 'Puerto Gelato' },
    { from: 'Cafetería', to: 'Trento Café' },
    { from: 'Cafeteria', to: 'Trento Café' }
  ];
  var sheetSpecs = [
    { name: SHEET_CATALOGO, headers: ['local_aplicable', 'local'] },
    { name: SHEET_CONFIG, headers: ['local'] },
    { name: SHEET_PEDIDOS, headers: ['local'] },
    { name: SHEET_DETALLE, headers: ['local'] },
    { name: SHEET_STOCK, headers: ['local'] },
    { name: SHEET_RECEPCION, headers: ['local'] },
    { name: SHEET_PRODUCCION, headers: ['local'] },
    { name: SHEET_ELABORADOS, headers: ['local'] }
  ];
  sheetSpecs.forEach(function (sheetSpec) {
    renameSpecs.forEach(function (renameSpec) {
      renameLocalAcrossSheet_(sheetSpec.name, sheetSpec.headers, renameSpec.from, renameSpec.to);
    });
  });
}

function renameLocalAcrossSheet_(sheetName, headerNames, from, to) {
  var sh = ss_().getSheetByName(sheetName);
  if (!sh || sh.getLastRow() < 2) return;
  var values = sh.getDataRange().getValues();
  var head = values[0].map(function (h) { return String(h).trim().toLowerCase(); });
  var col = idx_(head, headerNames);
  if (col === -1) return;
  for (var r = 1; r < values.length; r++) {
    if (String(values[r][col] || '').trim().toLowerCase() === String(from).trim().toLowerCase()) {
      sh.getRange(r + 1, col + 1).setValue(to);
    }
  }
}

function paintCards_(sh, rowStart, colStart, width, cards) {
  for (var i = 0; i < cards.length; i++) {
    var blockCol = colStart + (i % 2) * 4;
    var blockRow = rowStart + Math.floor(i / 2) * 2;
    sh.getRange(blockRow, blockCol, 1, width).merge().setValue(cards[i][0])
      .setBackground('#DCE8EF').setFontWeight('bold').setFontColor('#365165');
    sh.getRange(blockRow + 1, blockCol, 1, 2).merge().setValue(cards[i][1])
      .setBackground('#FFFFFF').setFontWeight('bold').setFontSize(18).setFontColor('#1C3448');
    sh.getRange(blockRow + 1, blockCol + 2, 1, 1).setValue(cards[i][2])
      .setBackground('#FFFFFF').setFontColor('#5B7082').setFontSize(10).setWrap(true);
    sh.getRange(blockRow, blockCol, 2, width).setBorder(true, true, true, true, false, false, '#CBD9E4', SpreadsheetApp.BorderStyle.SOLID);
  }
}

function applyBanding_(sh, headerRow, numRows, numCols) {
  var range = sh.getRange(headerRow, 1, numRows, numCols);
  var bandings = sh.getBandings();
  for (var i = 0; i < bandings.length; i++) bandings[i].remove();
  range.applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY);
}

function applyCorporateTabTheme_() {
  var ss = ss_();
  var tabColors = {};
  tabColors[SHEET_HOME] = '#103F59';
  tabColors[SHEET_VIEW_PED] = '#0F5E7A';
  tabColors[SHEET_VIEW_STK] = '#1F6E5A';
  tabColors[SHEET_VIEW_BUY] = '#8A5B00';
  tabColors[SHEET_VIEW_REC] = '#2D7D9A';
  tabColors[SHEET_VIEW_PROD] = '#2B7A68';
  tabColors[SHEET_VIEW_ELAB] = '#7A4A22';
  tabColors[SHEET_REPORT_ELAB] = '#D05A08';
  tabColors[SHEET_STOCK_DASH] = '#355C7D';
  tabColors[SHEET_RESUMEN] = '#4F6D7A';
  tabColors[SHEET_DETALLE] = '#7A8B99';
  tabColors[SHEET_STOCK] = '#7A8B99';
  tabColors[SHEET_RECEPCION] = '#7A8B99';
  tabColors[SHEET_PRODUCCION] = '#7A8B99';
  tabColors[SHEET_ELABORADOS] = '#7A8B99';
  tabColors[SHEET_PEDIDOS] = '#95A5A6';
  tabColors[SHEET_CATALOGO] = '#95A5A6';
  tabColors[SHEET_CONFIG] = '#95A5A6';

  var order = [
    SHEET_HOME, SHEET_REPORT_ELAB, SHEET_STOCK_DASH, SHEET_VIEW_PED, SHEET_VIEW_STK, SHEET_VIEW_REC, SHEET_VIEW_PROD, SHEET_VIEW_ELAB, SHEET_VIEW_BUY,
    SHEET_RESUMEN, SHEET_DETALLE, SHEET_STOCK, SHEET_RECEPCION, SHEET_PRODUCCION, SHEET_ELABORADOS, SHEET_PEDIDOS, SHEET_CATALOGO, SHEET_CONFIG
  ];
  for (var i = 0; i < order.length; i++) {
    var sh = ss.getSheetByName(order[i]);
    if (!sh) continue;
    sh.setTabColor(tabColors[order[i]] || '#95A5A6');
    ss.setActiveSheet(sh);
    ss.moveActiveSheet(i + 1);
  }
  ss.getSheets().forEach(function (sheet) {
    var name = sheet.getName();
    if (name.indexOf(SHEET_LOCAL_PED_PREFIX) === 0) sheet.setTabColor('#2D7D9A');
    if (name.indexOf(SHEET_LOCAL_STK_PREFIX) === 0) sheet.setTabColor('#2B7A68');
  });
  var home = ss.getSheetByName(SHEET_HOME);
  if (home) ss.setActiveSheet(home);
}

function numberOrNull_(value) {
  if (value === '' || value === null || typeof value === 'undefined') return null;
  var num = parseFloat(String(value).replace(',', '.'));
  return isNaN(num) ? null : num;
}

function numberOrZero_(value, fallback) {
  var num = numberOrNull_(value);
  if (num === null) return typeof fallback === 'number' ? fallback : 0;
  return num;
}

function numberOrBlank_(value) {
  var num = numberOrNull_(value);
  return num === null ? '' : num;
}

function comparableDateTime_(value) {
  var txt = String(value || '').trim();
  if (!txt) return 0;
  var iso = Date.parse(txt);
  if (!isNaN(iso)) return iso;
  var m = txt.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4]), Number(m[5]), Number(m[6] || 0)).getTime();
  return 0;
}

function round2_(num) {
  return Math.round(num * 100) / 100;
}
