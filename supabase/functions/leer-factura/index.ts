// Edge Function "leer-factura": recibe la foto (o fotos) o el PDF de una factura de proveedor y devuelve sus datos
// y renglones en JSON, leídos con Claude. Solo gerencia. El cruce con el catálogo lo hace la app (stock/js/factura-match.js).
// Con { modo: "comprobante" } lee un comprobante de pago (foto o PDF escaneado) para Pagos → Cargar pago (gerencia y contadora).
//
// Secretos (Supabase → Edge Functions → Secrets):
//   ANTHROPIC_API_KEY   clave de console.anthropic.com (obligatoria)
//   MODELO_FACTURAS     opcional: claude-sonnet-5-5 (por defecto, rápido), claude-opus-5-5 o claude-haiku-5-5
// Pedido:  POST { archivos: [{ data: <base64 sin "data:">, tipo: "image/jpeg" | "image/png" | "image/webp" | "application/pdf" }], modo?: "comprobante" }
// Respuesta: líneas JSON (application/x-ndjson) a medida que se lee, para que la app muestre los renglones al llegar:
//   { t: "<pedazo del JSON de la factura>" } ... y al final { fin: true, modelo, uso: { entrada, salida }, ms }
//   o { error: "texto para mostrar" }. Los errores previos a leer (permiso, clave, archivo) vuelven como JSON con status.
// Cada lectura deja en los logs de la función: modelo, ms hasta el primer texto, ms total y tokens.
import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};
const responder = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { ...CORS, "content-type": "application/json" } });

const TIPOS_IMAGEN = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_ARCHIVOS = 6;

const num = { type: ["number", "null"] };
const txt = { type: ["string", "null"] };
const ESQUEMA = {
  type: "object",
  additionalProperties: false,
  required: ["es_factura", "proveedor", "cuit", "tipo", "numero", "fecha", "vencimiento", "subtotal", "total", "renglones", "observaciones"],
  // Orden pensado para la lectura en vivo: primero el encabezado, después los renglones, al final las observaciones.
  properties: {
    es_factura: { type: "boolean" },
    proveedor: txt,
    cuit: txt,
    tipo: txt,
    numero: txt,
    fecha: txt,
    vencimiento: txt,
    subtotal: num,
    total: num,
    renglones: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["codigo", "descripcion", "cantidad", "unidad", "precio_unitario", "importe"],
        properties: { codigo: txt, descripcion: { type: "string" }, cantidad: num, unidad: txt, precio_unitario: num, importe: num },
      },
    },
    observaciones: txt,
  },
};

const INSTRUCCIONES = `Sos el asistente de compras de un grupo de restaurantes en Argentina. Te paso la factura, remito o ticket de un proveedor (puede venir en varias fotos, en orden). Extraé los datos tal como figuran:
- proveedor: razón social o nombre de fantasía del EMISOR (quien vende), no del cliente. cuit: el CUIT del emisor (11 dígitos con o sin guiones).
- tipo: "Factura A", "Factura B", "Factura C", "Recibo X" (comprobante no fiscal: letra X, "Documento no válido como factura", presupuesto o remito X), "Remito", "Ticket" o lo que diga. numero: punto de venta y número, ej. "0004-00226381".
- fecha y vencimiento (vencimiento de pago, NO el vencimiento del CAE) en formato AAAA-MM-DD; null si no figura.
- subtotal (neto sin IVA si figura) y total final a pagar, como números (sin $ ni separadores de miles; usá punto decimal).
- renglones: uno por producto, en el orden de la factura. codigo del artículo si figura; descripcion tal cual; cantidad; unidad (kg, un, caja, bulto…) si figura; precio_unitario = precio por unidad ya con descuentos o bonificaciones aplicados, tal como lo cobra el renglón (sin IVA en factura A); importe = total del renglón.
- No inventes: si un dato no se lee, poné null. No incluyas como renglones los subtotales, impuestos, percepciones, fletes ni descuentos generales; si hay flete o descuento general, mencionalo en observaciones.
- es_factura = false si la imagen no es un comprobante de compra (un recibo X, remito o presupuesto de compra SÍ lo es).
- observaciones: algo que convenga revisar (foto cortada, renglón ilegible, total que no coincide con la suma), o null.`;

// Modo "comprobante": comprobante de transferencia o pago (Mercado Pago, home banking, captura de WhatsApp) para Pagos → Cargar pago.
// Mismos nombres de campo que el lector de PDF de la app (supabase/lib/comprobante.js), así se precarga igual.
const ESQUEMA_COMPROBANTE = {
  type: "object",
  additionalProperties: false,
  required: ["es_comprobante", "monto", "fecha", "numero_operacion", "proveedor_razon_social", "cuit_destino", "banco_destino", "cuenta_destino",
    "pagador", "cuit_pagador", "cuenta_origen", "concepto", "descripcion"],
  properties: {
    es_comprobante: { type: "boolean" },
    monto: num, fecha: txt, numero_operacion: txt,
    proveedor_razon_social: txt, cuit_destino: txt, banco_destino: txt, cuenta_destino: txt,
    pagador: txt, cuit_pagador: txt, cuenta_origen: txt, concepto: txt, descripcion: txt,
  },
};

const INSTRUCCIONES_COMPROBANTE = `Sos el asistente de pagos de un grupo de restaurantes en Argentina. Te paso el comprobante de una transferencia o pago a un proveedor (Mercado Pago, home banking, una captura de WhatsApp, etc.). Extraé los datos tal como figuran:
- monto: importe transferido como número (sin $ ni separadores de miles; usá punto decimal). fecha: fecha del pago en formato AAAA-MM-DD.
- numero_operacion: el número o código de la operación o transacción ("N.° de operación", "Identificador de la operación", "Nro. de comprobante"); si hay varios, el número de operación principal.
- proveedor_razon_social, cuit_destino, banco_destino y cuenta_destino (CBU, CVU o alias): del DESTINATARIO, quien recibe la plata.
- pagador, cuit_pagador y cuenta_origen: de quien paga (el ORIGEN).
- concepto y descripcion: el motivo o concepto si figura (ej. "Varios", "Factura"), si no null.
- No inventes: si un dato no se lee, poné null. es_comprobante = false si la imagen no es un comprobante de pago o transferencia.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return responder({ error: "Método no permitido" }, 405);

  // Solo gerencia: se consulta el rol con la sesión de quien llama (las políticas RLS de la base deciden).
  const auth = req.headers.get("Authorization") || "";
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  let pedido: { archivos?: { data: string; tipo: string }[]; modo?: string } = {};
  try { pedido = await req.json(); } catch (_e) { return responder({ error: "Pedido inválido." }, 400); }
  const comprobante = pedido.modo === "comprobante";
  const { data: rol, error: errRol } = await sb.rpc("mi_rol");
  const permitidos = comprobante ? ["gerencia", "contadora"] : ["gerencia"];
  if (errRol || !permitidos.includes(rol)) return responder({ error: comprobante ? "Solo gerencia y administración pueden leer comprobantes." : "Solo gerencia puede leer facturas." }, 403);

  // Tolera el nombre cargado con espacios o en minúsculas en Supabase → Secrets.
  const entorno = Deno.env.toObject();
  const nombre = Object.keys(entorno).find((k) => k.trim().toUpperCase() === "ANTHROPIC_API_KEY");
  const clave = nombre ? entorno[nombre].trim() : "";
  if (!clave) {
    // Solo nombres (nunca valores), para ver si la clave se cargó con otro nombre.
    const nombres = Object.keys(entorno);
    console.log(JSON.stringify({ evento: "leer-factura-sin-clave", parecidos: nombres.filter((k) => /anthropic|claude|api.?key/i.test(k) && !/^sk-/i.test(k.trim())),
      clave_como_nombre: nombres.some((k) => /^sk-ant/i.test(k.trim())), total_secretos: nombres.length }));
    return responder({ error: "Falta configurar la clave de Anthropic (ANTHROPIC_API_KEY) en Supabase." }, 503);
  }

  const archivos = pedido.archivos || [];
  if (!Array.isArray(archivos) || !archivos.length) return responder({ error: "No llegó ningún archivo." }, 400);
  if (archivos.length > MAX_ARCHIVOS) return responder({ error: `Máximo ${MAX_ARCHIVOS} fotos por factura.` }, 400);

  const bloques: Anthropic.Beta.BetaContentBlockParam[] = [];
  for (const a of archivos) {
    const data = String(a.data || "").replace(/^data:[^,]*,/, "");
    if (a.tipo === "application/pdf") bloques.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data } });
    else if (TIPOS_IMAGEN.includes(a.tipo)) bloques.push({ type: "image", source: { type: "base64", media_type: a.tipo as "image/jpeg", data } });
    else return responder({ error: "Formato no admitido: subí una foto (JPG/PNG) o un PDF." }, 400);
  }
  bloques.push({ type: "text", text: comprobante ? INSTRUCCIONES_COMPROBANTE : INSTRUCCIONES });

  const modelo = Deno.env.get("MODELO_FACTURAS") || "claude-sonnet-5-5";
  // Pasar una factura a JSON no necesita razonar: sin "pensar" y con esfuerzo bajo responde mucho antes.
  // Sonnet 5.5 apaga el pensamiento con between_tools; Opus 5.5 no lo permite y se queda con esfuerzo bajo.
  const thinking = modelo.startsWith("claude-sonnet") ? { thinking: { type: "between_tools" as const } } : {};
  // Si el modelo declina por política, la API reintenta sola con otro modelo (no existe para Haiku).
  const conRespaldo = !modelo.startsWith("claude-haiku");
  const client = new Anthropic({ apiKey: clave });
  const enc = new TextEncoder();
  const t0 = Date.now();
  const cuerpo = new ReadableStream({
    async start(ctrl) {
      const enviar = (o: unknown) => ctrl.enqueue(enc.encode(JSON.stringify(o) + "\n"));
      let tPrimero = 0;
      try {
        const stream = client.beta.messages.stream({
          model: modelo,
          max_tokens: 16000,
          ...thinking,
          ...(conRespaldo ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" } : {}),
          output_config: { effort: "low", format: { type: "json_schema", schema: comprobante ? ESQUEMA_COMPROBANTE : ESQUEMA } },
          messages: [{ role: "user", content: bloques }],
        });
        stream.on("text", (t) => { if (!tPrimero) tPrimero = Date.now(); enviar({ t }); });
        const r = await stream.finalMessage();
        const ms = Date.now() - t0;
        console.log(JSON.stringify({ evento: comprobante ? "leer-comprobante" : "leer-factura", modelo: r.model, ms_primer_texto: tPrimero ? tPrimero - t0 : null, ms_total: ms,
          entrada: r.usage.input_tokens, salida: r.usage.output_tokens, archivos: archivos.length, fin: r.stop_reason }));
        if (r.stop_reason === "refusal") enviar({ error: "No se pudo leer este archivo. Probá con otra foto." });
        else if (r.stop_reason === "max_tokens") enviar({ error: "La factura es demasiado larga para leerla de una vez. Subila en partes." });
        else enviar({ fin: true, modelo: r.model, uso: { entrada: r.usage.input_tokens, salida: r.usage.output_tokens }, ms });
      } catch (e) {
        console.log(JSON.stringify({ evento: "leer-factura-error", modelo, ms_total: Date.now() - t0, error: String(e) }));
        enviar({ error: mensajeError(e) });
      }
      ctrl.close();
    },
  });
  return new Response(cuerpo, { headers: { ...CORS, "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
});

function mensajeError(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return "La clave de Anthropic no es válida. Revisala en Supabase.";
  if (e instanceof Anthropic.PermissionDeniedError) return "La cuenta de Anthropic no tiene permiso (¿falta cargar crédito?).";
  if (e instanceof Anthropic.RateLimitError) return "Demasiadas facturas seguidas. Esperá un minuto.";
  if (e instanceof Anthropic.BadRequestError && /credit|billing/i.test(e.message)) return "La cuenta de Anthropic se quedó sin crédito.";
  if (e instanceof Anthropic.APIError) return "El servicio que lee facturas falló. Probá de nuevo en un rato.";
  return "Algo salió mal al leer la factura.";
}
