/* Docks V3 · notificaciones Telegram (§4.4). Opcional: sin propiedades no hace nada.
 * Un fallo se registra en LOG y nunca hace fallar la escritura. */

function telegram_(texto, ref, local) {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('TELEGRAM_BOT_TOKEN');
  var chat = props.getProperty('TELEGRAM_CHAT_ID');
  if (!token || !chat) return false;
  try {
    var res = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ chat_id: chat, text: String(texto).slice(0, 3900), disable_web_page_preview: true }),
      muteHttpExceptions: true
    });
    var code = res && res.getResponseCode ? res.getResponseCode() : 200;
    if (code < 200 || code >= 300) {
      log_('TELEGRAM', ref, local, false, 'Telegram respondió ' + code);
      return false;
    }
    return true;
  } catch (e) {
    log_('TELEGRAM', ref, local, false, 'No se pudo avisar por Telegram: ' + errMsg_(e));
    return false;
  }
}

/* Para probar desde el editor: envía un mensaje de prueba. */
function probarTelegramV3() {
  resetReq_();
  return telegram_('Docks V3 · prueba de notificaciones (' + nowStr_() + ')', 'prueba', '');
}
