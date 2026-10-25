# Comprobantes de pago a proveedores

Muestra recibida el 25/10/2026: transferencia "Office Banking" en PDF digital (texto seleccionable, sin OCR).

## Campos que trae

| Etiqueta del PDF | Columna en `pagos` |
|---|---|
| Identificador de la operación | `numero_operacion` (único: evita cargar dos veces el mismo pago) |
| Fecha de envío | `fecha` |
| Monto | `monto` |
| Concepto / Descripción | `concepto` / `descripcion` |
| Cuenta a debitar | `cuenta_origen` |
| Datos del destinatario: CUIT/CUIL | `cuit_destino` → identifica al proveedor (`proveedores.cuit`) |
| Cuenta en / Cuenta de destino | `banco_destino` / `cuenta_destino` |

`supabase/lib/comprobante.js` tiene `leerComprobante(texto)` y `mensajeAviso(pago, proveedor)`.
En la app, pdf.js saca el texto del PDF en el navegador; no hace falta servidor.

## Flujo previsto (fase 4)

1. La contadora sube el PDF en la app (o lo elige de la lista de comprobantes).
2. La app lee los datos y busca el proveedor por CUIT. La primera vez, si el proveedor no tiene CUIT
   cargado, lo sugiere por razón social y guarda el CUIT al confirmar.
3. Se imputa a las facturas pendientes del proveedor.
4. Botón **Avisar por WhatsApp**: en el celular usa Compartir con el PDF adjunto y el mensaje; en la PC
   abre wa.me con el mensaje. Lo envía una persona, nunca un bot, así Meta no bloquea el número.
