# Sistema de Pedidos · Polo Gastronómico Docks del Puerto

Formulario web de requisición semanal de insumos para los locales del Polo
Gastronómico (Puerto de Frutos, Tigre). Cada encargado carga su pedido desde el
celular; el pedido se registra en un Google Sheet maestro que gerencia consolida en
órdenes de compra.

## Componentes

- **`index.html`** — formulario inteligente (single-file, sin build). Desplegado en
  GitHub Pages. Conectado al catálogo: autocompleta encargado/email por local,
  typeahead de productos con proveedor + precio + código, total estimado en vivo,
  carga libre para productos fuera de catálogo. Responsive iPhone / iPad / PC.
- **`Code.gs`** — Apps Script v2 (backend). Sirve el catálogo y la config al form,
  recibe los pedidos y los escribe en la hoja `PEDIDOS RECIBIDOS`.

## Configuración (⚙ en el header)

Pantalla de administración dentro del form. Por local permite:
- **Agregar productos al catálogo** (nombre, categoría, unidad, proveedor) → escribe en
  `CATÁLOGO PRODUCTOS` con código autogenerado (PAR001, CAF005, ...).
- **Agregar responsables** (nombre, email) → escribe en `CONFIGURACIÓN`.

Los cambios van directo a la planilla (vía `Code.gs`: acciones `addProducto` /
`addResponsable`). El form refresca el catálogo solo. Requiere `Code.gs` v2 desplegado.

## Locales

Parrilla · GreenFresh (viandas saludables) · Heladería · Cafetería ·
Hamburguesería · Eventos · Shopping.

## Google Sheet (backend)

Hojas relevantes: `CATÁLOGO PRODUCTOS`, `CONFIGURACIÓN`, `PEDIDOS RECIBIDOS`,
`PEDIDOS_DETALLE` (nueva, normalizada), `RESUMEN POR PROVEEDOR` (nueva),
`ÓRDENES DE COMPRA`, `DASHBOARD GERENCIAL`, `CONTROL STOCK`.

### Modelo de datos (clave)

`PEDIDOS RECIBIDOS` guarda el pedido con los productos como **texto** (1 fila por pedido,
compatibilidad). `PEDIDOS_DETALLE` lo **normaliza**: 1 fila por producto
(id, semana, local, código, producto, categoría, cantidad, unidad, proveedor, estado).
Esto permite sumar por proveedor, pivotear y armar órdenes de compra exactas sin
re-parsear texto. El form escribe ambas en cada envío.

## Deploy / actualización

1. **Apps Script:** Sheet maestro > Extensiones > Apps Script. Pegar `Code.gs`, guardar.
2. **Setup (una vez):** ejecutar desde el editor:
   - `setupGreenFresh()` — agrega GreenFresh, renombra Hamburguesería→Brooklyn, desactiva Pizzería.
   - `setupPlantillaPro()` — crea/formatea `PEDIDOS_DETALLE` (1 fila por producto, validaciones,
     colores), migra los pedidos viejos parseando el texto, y crea `RESUMEN POR PROVEEDOR`
     (consolidado por proveedor para la semana elegida en B1).
3. **Implementar:** Implementar > Nueva implementación > Aplicación web >
   Ejecutar como *yo*, Acceso *Cualquiera*. Copiar la URL `/exec`.
4. Si la URL cambió, actualizar `SCRIPT_URL` en `index.html`.
5. **Frontend:** push a `main` → GitHub Pages publica automáticamente.

## Notas técnicas

- El form trae un snapshot del catálogo embebido; al abrir intenta refrescarlo en vivo
  desde `?action=getBootstrap`. Si el script no responde, usa el snapshot.
- El envío usa `mode: no-cors`: el form no puede leer la respuesta, asume éxito si no
  hay error de red. Para confirmación real habría que servir CORS desde el Apps Script.
- Contrato de escritura: 17 columnas de `PEDIDOS RECIBIDOS` sin cambios (compatible con
  el sistema existente). Se agrega `total_estimado` calculado y `proveedor_asignado`.
