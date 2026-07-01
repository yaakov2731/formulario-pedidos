# Sistema de Pedidos · Polo Gastronómico Docks del Puerto

Formulario web de requisición semanal de insumos para los locales del Polo
Gastronómico (Puerto de Frutos, Tigre). Cada encargado carga su pedido desde el
celular; el pedido se registra en un Google Sheet maestro que gerencia consolida en
órdenes de compra.

## Componentes

- **`index.html`** — formulario inteligente (single-file, sin build). Desplegado en
  GitHub Pages. Conectado al catálogo: autocompleta encargado/email por local,
  typeahead de productos con proveedor + precio + código, total estimado en vivo,
  carga libre para productos fuera de catálogo, lectura operativa de stock del pedido
  y carga manual de stock real por local. Responsive iPhone / iPad / PC.
- **`Code.gs`** — Apps Script v2 (backend). Sirve el catálogo y la config al form,
  recibe los pedidos, registra conteos de stock y escribe en `PEDIDOS RECIBIDOS`.

## Configuración (⚙ en el header)

Pantalla de administración dentro del form. Por local permite:
- **Agregar productos al catálogo** (nombre, categoría, unidad, proveedor) → escribe en
  `CATÁLOGO PRODUCTOS` con código autogenerado (PAR001, CAF005, ...).
- **Agregar responsables** (nombre, email) → escribe en `CONFIGURACIÓN`.
- **Cargar stock real** (conteo parcial o cierre, solo stock real por producto) →
  actualiza el catálogo del local, deja trazabilidad en `CONTROL STOCK` y alimenta
  `DASHBOARD STOCK`.

Los cambios van directo a la planilla (vía `Code.gs`: acciones `addProducto` /
`addResponsable`). El form refresca el catálogo solo. Requiere `Code.gs` v2 desplegado.

## Locales

Umo Grill · GreenFresh (viandas saludables) · Puerto Gelato · Trento Café ·
Brooklyn · Eventos · Shopping.

## Google Sheet (backend)

Hojas relevantes: `CATÁLOGO PRODUCTOS`, `CONFIGURACIÓN`, `PEDIDOS RECIBIDOS`,
`PEDIDOS_DETALLE` (nueva, normalizada), `RESUMEN POR PROVEEDOR` (nueva),
`ÓRDENES DE COMPRA`, `DASHBOARD GERENCIAL`, `CONTROL STOCK` (conteos manuales por local).

Además, la V2 puede reconstruir vistas derivadas automáticas por local:
- `LOCAL PEDIDO · <Local>` — pedido abierto del local con KPIs y detalle operativo.
- `LOCAL STOCK · <Local>` — stock real, cobertura, últimas recepciones y producción.

Estas pestañas se generan desde la base técnica; no son hojas para editar manualmente.
El `getBootstrap` V2 también expone un `snapshot` operativo para el frontend, con
totales, resumen por local y líneas abiertas recientes por local.

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

## Verificación local V2

Antes de desplegar, podés correr una comprobación estructural rápida:

```powershell
node .\scripts\verify-v2.js
```

La verificación confirma que sigan presentes:
- los módulos `Pedido`, `Stock`, `Recepción`, `Producción` y `Dashboard`,
- los endpoints nuevos de Apps Script,
- las hojas y vistas V2,
- las pestañas automáticas por local para pedido y stock,
- el snapshot operativo con líneas abiertas por local,
- la normalización de aliases viejos de locales,
- y las rutas críticas del guardado y dashboard operativo.

## Verificación live del deploy

Para comparar el `/exec` publicado contra la estructura V2 local:

```powershell
node .\scripts\verify-live-v2.js
```

Ese chequeo usa el `SCRIPT_URL` actual de `index.html` y valida:
- `ping` y `getBootstrap`,
- presencia de `recepciones` y `produccion`,
- presencia de `snapshot` operativo y capacidades V2 activas,
- y normalización de locales viejos (`Parrilla`, `Heladería`, `Cafetería`, `Pizzería`).

## Cierre operativo

El procedimiento completo de publicación y validación final quedó resumido en
[DEPLOY-V2.md](C:\Users\jcbru\OneDrive\Documents\pedidos%20Semanales\DEPLOY-V2.md).

## Notas técnicas

- El form trae un snapshot del catálogo embebido; al abrir intenta refrescarlo en vivo
  desde `?action=getBootstrap`. Si el script no responde, usa el snapshot.
- El envío usa `mode: no-cors`: el form no puede leer la respuesta, asume éxito si no
  hay error de red. Para confirmación real habría que servir CORS desde el Apps Script.
- Contrato de escritura: 17 columnas de `PEDIDOS RECIBIDOS` sin cambios (compatible con
  el sistema existente). Se agrega `total_estimado` calculado y `proveedor_asignado`.
