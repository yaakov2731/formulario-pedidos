/* ============================== WRITE PEDIDO ============================== */

function appendPedido_(d) {
  var sh = ss_().getSheetByName(SHEET_PEDIDOS);
  if (!sh) throw new Error('No existe la hoja "' + SHEET_PEDIDOS + '"');
  d.local = normalizeLocalName_(d.local);
  // Mismo orden de 17 columnas que ya usa la hoja.
  var row = [
    d.id_pedido || '',
    d.fecha_hora || new Date().toLocaleString('es-AR'),
    d.local || '',
    d.encargado || '',
    d.semana_pedido || '',
    d.email_encargado || '',
    d.estado || 'Recibido',
    d.urgencia || 'Normal',
    d.productos_solicitados || '',
    d.total_productos || 0,
    d.total_estimado || '',
    d.fecha_entrega || '',
    d.observaciones || '',
    d.proveedor_asignado || '',
    d.comprado || 'NO',
    d.entregado || 'NO',
    d.notas_gerencia || ''
  ];
  sh.appendRow(row);
}
