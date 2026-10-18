# Pedidos Semanales · Docks del Puerto

Aplicación operativa para pedidos, stock, recepción, producción, elaborados y
reportes. Borradores por local y catálogos guiados por sus propios pedidos.

[Abrir la app](https://yaakov2731.github.io/formulario-pedidos/).

## Arquitectura real

- `index.html`: frontend sin bundler, publicado en GitHub Pages.
- `admin.js`: superficie administrativa existente.
- `gas/*.gs`: backend modular de Apps Script, conectado a Google Sheets.
- `scripts/`: verificaciones estructurales y de comportamiento. Los tests locales
  usan funciones reales con almacenamiento y planillas en memoria, sin escrituras
  operativas. La verificación live consulta el backend y el estado de Telegram;
  no envía notificaciones.

Este repositorio no usa React, Vite ni TypeScript. Tampoco sincroniza directamente
el Excel de OneDrive: la fuente actual es Google Sheets.

## Verificar antes de publicar

Desde esta carpeta, con Node.js instalado:

```powershell
node .\scripts\verify-v2.js
node .\scripts\verify-par.js
node .\scripts\verify-reception-guide.js
node .\scripts\verify-local-drafts.js
node .\scripts\verify-local-catalog.js
node .\scripts\verify-jsonp.js
node .\scripts\verify-dashboard-render.js
node .\scripts\verify-unit-quantities.js
node .\scripts\verify-order-send.js
node .\scripts\verify-responsables.js
```

Después de publicar:

```powershell
node .\scripts\verify-live-v2.js
```

Los tests no sustituyen la prueba visual ni un guardado operativo confirmado por ID.

## Publicación y operación

El workflow de GitHub verifica primero el código y publica por separado Apps Script
y GitHub Pages al actualizar `main`. No ejecutar setup, migraciones ni reset como
parte de una actualización habitual.

Consultar [DEPLOY-V2.md](DEPLOY-V2.md) para las comprobaciones de cierre,
[PRODUCT.md](PRODUCT.md) para los flujos y [DESIGN.md](DESIGN.md) para el diseño.
No incluir planillas privadas, capturas operativas ni credenciales en Git.

## V3 · sistema nuevo (en construcción, no reemplaza todavía a la app actual)

Pedidos, conteo, recepción y compras con planilla propia de 9 pestañas. Contrato en
[docs/v3/CONTRATO.md](docs/v3/CONTRATO.md), despliegue en [docs/v3/DESPLIEGUE.md](docs/v3/DESPLIEGUE.md).

- `v3/index.html`: encargados (celular) · Hoy, Pedir, Contar, Recibir.
- `v3/compras.html`: gerencia (escritorio) · Compras, Órdenes, Faltantes, Stock, Catálogo, Proveedores, Locales.
- `v3/gas/`: backend Apps Script. `v3/apps-script/DocksV3.gs` es el mismo código en un archivo para pegar.

```powershell
node .\scripts\verify-v3-core.js
node .\scripts\verify-v3-backend.js
node .\scripts\verify-v3-encargado.js
node .\scripts\verify-v3-compras.js
node .\scripts\v3-bundle-gas.js --check
node .\scripts\v3-dev-server.js --seed   # prueba local en memoria: http://localhost:8787/?api=/api
```

## Continuidad con herramientas de IA

Leer `ESTADO.md` al retomar trabajo. [USO-IA.md](USO-IA.md) explica el protocolo
de tareas, modelos y revisión de siete días. Las reglas están en `AGENTS.md` y
`CLAUDE.md`; el registro personal de consumo y presupuesto queda en `.uso-ia/`,
excluido de Git. `.codex/` y `.claude/` configuran modelos por rol para nuevas
sesiones del proyecto; no modifican suscripciones.
