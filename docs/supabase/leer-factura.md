# Recibir con factura

Gerencia → Recibir → **Recibir con factura**. Foto(s) o PDF de la factura del proveedor → la app lee los renglones,
los cruza con el catálogo del local y, al confirmar, suma stock, guarda precios y deja la factura en Pagos.
Sirve para pedidos hechos fuera de la app; si hay un pedido abierto del mismo proveedor y local, lo da por recibido
y muestra lo que faltó.

## Piezas

- `supabase/functions/leer-factura/index.ts`: Edge Function que manda el archivo a Claude y devuelve JSON
  (proveedor, CUIT, número, fechas, total y renglones). Solo gerencia (consulta `mi_rol()` con la sesión de quien llama).
- `supabase/migrations/0018_recibir_factura.sql`: tabla `recepciones` y RPC `recibir_con_factura()`.
- `stock/js/factura-match.js`: cruce con el catálogo. Orden: alias aprendido (`producto_alias` origen `proveedor`,
  por local) → código del mayorista (`LOCAL-DS-<código>`) → parecido del nombre. Lo que no está seguro queda para elegir a mano;
  al confirmar, ese nombre queda aprendido para la próxima factura.
- `stock/js/g-recibir-factura.js`: pantalla. Prueba: `node scripts/e2e-recibir-factura.js`.

## Puesta en marcha (una vez)

1. Pegar `0018_recibir_factura.sql` en el SQL Editor de Supabase.
2. Publicar la función `leer-factura` (con verificación de JWT).
3. En console.anthropic.com: crear cuenta, cargar crédito y crear una clave de API.
4. Supabase → Edge Functions → Secrets: `ANTHROPIC_API_KEY` = la clave. Opcional `MODELO_FACTURAS`
   (`claude-opus-5-5` por defecto, `claude-sonnet-5-5` o `claude-haiku-5-5`).

Costo aproximado por factura de una página: Opus 5.5 ~US$0,05 · Sonnet 5.5 ~US$0,03 · Haiku 5.5 ~US$0,002.

## Notas

- Los precios de factura A se leen sin IVA (como figuran en el renglón).
- La misma factura (proveedor + número + local) no se puede recibir dos veces.
- Las fotos se achican a 1800 px antes de mandarlas; varias fotos se guardan unidas en una sola imagen en `comprobantes`.
