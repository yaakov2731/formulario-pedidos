# Plan de rediseño estilo Apple · app de stock

2026-11-10 · Pedido por Jacobo. Copia editable para Jacobo: https://claude.ai/artifact/1FqpRvS49m6x5tt5NgERVW

## Resumen

La app de stock y compras (`/stock/`) pasa de 9 secciones y unas 30 pantallas a una sola idea por rol: el encargado ve **Hoy** (una lista de tareas que la app arma sola) y gerencia ve **Hoy** (lo que necesita su decisión), y todo lo demás queda a un toque de distancia, nunca en el camino.

- **Por qué no la usan:** hoy cada tarea vive en su propia pantalla y el encargado tiene que saber adónde ir. Una app de Apple hace lo contrario: abre en lo que toca hacer ahora.
- **Qué cambia en la lógica:** la app propone (pedido sugerido, qué contar hoy, qué falta recibir) y la persona solo confirma o corrige.
- **Qué no cambia:** las reglas vigentes (hoja por sector, sin precios para encargados, sin mínimo/par, Shopping por retiros, único admin Jacobo) y la base de datos de Supabase. Casi todo es frontend.
- **Cómo se ejecuta:** 6 fases chicas, cada una un PR que Opus hace solo y Jacobo aprueba diciendo "mergear". Cada fase se publica funcionando.

Supuesto: es la app de stock y compras, no la app vieja de pedidos (`index.html`) ni la app Docks (`/app/`).

## Diagnóstico

La app está organizada como la base de datos (pedidos, stock, conteos, retiros, facturas) y no como el día de trabajo del local. Navegación actual en `stock/js/main.js` (`NAV`) y `stock/js/ui.js` (`SUBNAV_*`).

| Problema | Dónde se ve | Efecto |
| --- | --- | --- |
| Gerencia: 9 secciones, ~25 subpantallas, hasta 3 niveles de pestañas | Tablero, Pedidos, Compras, Notas, Stock (Qué hay · Control → Día/Semana/Retiros/Conteos · Lugares), Ventas (4), Cocina (3), Pagos (4), Catálogo (4) | Nadie recuerda dónde está cada cosa |
| El encargado abre en "Pedir", no en lo que le toca | Barra: Pedir · Mis pedidos · Hoja · Facturas · Más | Decide él qué hacer y en qué orden |
| La Hoja tiene dos botones por fila | Hoja → Durante el día: "+ Entró" y "⋯" | Pantalla cargada |
| Estados de pedido distintos según pantalla | borrador, aprobada, enviada, parcial, recibida, "revisar" | Gerencia no sabe qué falta |
| Todo centrado y en mayúsculas espaciadas | Tablero: "VENTAS", "COMPRAS" | Se lee lento |
| Pestañas de locales cortadas | Tablero: "Todos los locales · Umo Grill · Trento Ca…" | Selector incompleto en celular |
| La app no propone nada | Pedir arranca vacío, Contar no dice qué contar | Depende de la memoria del encargado |

Se conserva: Hoja por sector, "Quedan N / Pedir N", pedido consolidado por proveedor con imagen para WhatsApp, tema oscuro.

## Principios estilo Apple (obligatorios en cada pantalla)

1. **Una pantalla, una tarea.**
2. **Abrir en lo que toca ahora.** La primera pantalla de cada rol es "Hoy"; vacía dice "Todo listo por hoy".
3. **La app propone, la persona confirma.** Cantidades sugeridas cargadas, botón grande "Listo".
4. **Dos niveles como máximo.** Barra inferior + como mucho un selector segmentado. Lo profundo se abre como hoja inferior (sheet).
5. **Listas agrupadas tipo Ajustes de iPhone.** Filas de 52–60 px, texto a la izquierda, número a la derecha, chevron si abre algo. Nada centrado salvo estados vacíos.
6. **Un solo color de acción.** Naranja solo para lo que se toca; rojo solo para alertas. Sin mayúsculas espaciadas.
7. **Sin miedo a equivocarse.** "Deshacer" en el aviso de 5 s; "¿Seguro?" solo para borrar.

## Nueva estructura

Cada rol: 4 pestañas en la barra, la primera es Hoy. Las rutas viejas (`#/contar`, `#/sector`, etc.) siguen andando y redirigen.

**Encargado (locales que elaboran)**

| Pestaña | Qué tiene | Reemplaza a |
| --- | --- | --- |
| Hoy | Tarjetas en orden: Abrir sector → Pedido sugerido (hasta el miércoles) → Llegó mercadería → Subir factura → Cerrar sector. Cada tarjeta lleva a una pantalla y vuelve a Hoy | Nueva |
| Pedir | Cantidades sugeridas cargadas, agrupado por proveedor, buscador. "Mis pedidos" como sección abajo | Pedir + Mis pedidos |
| Hoja | Hoja por sector; un toque en la fila abre hoja inferior Entró / Devolví / Merma | Hoja |
| Más | Facturas, Notas, Cambiar local, Cerrar sesión | Más |

**Shopping:** igual, pero Hoja se llama **Retiros** (producto, cantidad, destino, quién retira) y Hoy muestra "Abrir / Cerrar depósito".

**Gerencia**

| Pestaña | Qué tiene | Reemplaza a |
| --- | --- | --- |
| Hoy | Pedidos para aprobar (por proveedor), entregas de hoy, facturas por vencer en 7 días, diferencias del día en $, locales sin pedido o sin cierre. Arriba: ventas, compras y margen de la semana | Tablero |
| Compras | Lista por proveedor con un solo estado: Para aprobar → Para enviar → Enviado → Recibido / Llegó incompleto. Tocar abre orden, imagen WhatsApp y Recibir | Pedidos + Compras |
| Stock | Segmentado: Qué hay · Control · Lugares. Control = una lista con filtro Hoy / Semana; Retiros y Conteos se abren desde ahí | Stock de 3 niveles |
| Más | Lista tipo Ajustes: Números (ventas, análisis, merma, importar Núcleo), Cocina, Pagos, Catálogo, Notas, Ajustes | Ventas, Cocina, Pagos, Catálogo, Notas |

**Contadora:** sin cambios de estructura, toma el estilo nuevo.

**Selector de local:** un botón arriba a la derecha ("Umo ▾") que abre hoja con locales y "Todos"; recuerda el último.

## Lógica más inteligente

Usa datos que ya existen. Sin datos suficientes, no inventa: campo vacío y "Sin historial todavía".

| Función | Regla | Quién la ve |
| --- | --- | --- |
| Pedido sugerido | Pedir = consumo diario promedio (últimas 4 semanas) × días hasta la próxima entrega + 1 día de colchón − Quedan − pedido sin recibir; redondeo hacia arriba al bulto. Solo "Pedir N" | Encargado (sin precios) y gerencia |
| Tareas de Hoy | Según hora y día: apertura sin hacer, pedido sin mandar (lun–mié; viernes solo Florida), entrega esperada hoy, cierre sin hacer después de las 18 h | Ambos |
| Recibir contra lo pedido | Abre con lo pedido cargado; "Llegó todo" o corregir fila → "Llegó incompleto" con faltante | Gerencia (encargado si Jacobo decide) |
| Aviso de número raro | Más de 3× lo habitual o stock negativo: "Normalmente son unas 12. ¿Está bien 120?" | Encargado |
| Diferencia en $ | Cierre esperado − cierre contado, a costo, mayor a menor | Gerencia |
| Corte de proveedores | "Cierra miércoles" / "Cierra hoy 12 h" (De Ridder); en gerencia aviso si De Ridder < $100.000 | Encargado (sin montos) y gerencia |
| Local sin pedido | Miércoles a la tarde, en Hoy de gerencia | Gerencia |

## Sistema visual

Tokens en `:root` de `stock/css/stock.css` (el tema del muestrario que elija Jacobo se aplica cambiando solo tokens).

| Elemento | Hoy | Nuevo |
| --- | --- | --- |
| Letra | Poppins, mayúsculas espaciadas | Letra del sistema (`-apple-system`, SF Pro / Roboto). Título grande 34 px a la izquierda que se achica al hacer scroll |
| Fondo | Degradé negro con brillo naranja | Negro liso `#000`–`#0B0B0C`; brillo solo en Entrar |
| Tarjetas | Vidrio, centradas | Listas agrupadas `#1C1C1E`, radio 12 px, separadores finos |
| Acción | Naranja/verde/rojo mezclados | Naranja `#FF8A1F` botones; verde solo "Listo"; rojo solo alertas |
| Botones | Varios tamaños | Principal fijo abajo, ancho completo, 50 px; táctil mínimo 44 px |
| Números | Mezclados | Cifras tabulares a la derecha, 17 px, "2 cajas + 1" |
| Detalles | Pantallas nuevas | Hojas inferiores, aviso con Deshacer, vibración corta al confirmar |

Impresión A4 e imagen de orden para WhatsApp no cambian.

## Fases para Opus

Un PR por fase, en orden, con `ejecutor-opus`, sin agentes anidados. Jacobo revisa capturas y dice "mergear".

**Reglas para todas las fases**

- Leer `AGENTS.md`, `ESTADO.md` y este plan. Archivos grandes (`g-pedidos.js` 57 KB, `stock.css` 127 KB) con grep y rangos.
- No tocar la base salvo que la fase lo diga. Si hace falta SQL: completo e idempotente en `/mnt/project-files/supabase/` y pegado a Jacobo en el hilo.
- Respetar: encargados sin precios, sin "mínimo/par", hoja por sector, Shopping por retiros, único admin Jacobo, tema oscuro.
- Capturas 390 px y 1366 px (viewport, no fullPage) en `/mnt/project-files/app-stock/rediseno-apple/faseN/`. Correr `node scripts/verify-stock.js` y los `e2e-*.js` de lo tocado. `sw.js` queda en `stock-v1`.
- Las rutas viejas siguen andando (redirigen).

1. **Fase 1 · Base visual (3 h).** Tokens nuevos en `stock/css/stock.css` y componentes en `stock/js/ui.js`: lista agrupada, hoja inferior, botón fijo abajo, título grande, aviso con Deshacer, selector de local en hoja.
    - Aceptación: pantallas actuales con estilo nuevo sin perder funciones; texto a la izquierda; sin mayúsculas espaciadas; `verify-stock.js` verde.
2. **Fase 2 · Navegación de 4 pestañas (3 h).** `NAV` en `stock/js/main.js` y subnavs en `ui.js` según Nueva estructura. Más como lista tipo Ajustes. Control de Stock en una lista con filtro Hoy / Semana. Selector de local único.
    - Aceptación: ningún rol con más de 4 pestañas + Más; ninguna pantalla con 3 niveles; rutas viejas abren algo; `e2e-stock.js`, `e2e-control.js`, `e2e-hoja.js` verdes.
3. **Fase 3 · Pantallas Hoy (4 h).** Nuevo `stock/js/hoy.js` (encargado) y `stock/js/g-hoy.js` (gerencia, absorbe `g-tablero.js`), con consultas existentes de `api.js`.
    - Aceptación: abre en Hoy; cada tarjeta lleva y vuelve; vacío "Todo listo por hoy"; gerencia ve aprobar, entregas, facturas por vencer, diferencias en $, locales sin pedido.
4. **Fase 4 · Pedido sugerido (4 h).** `stock/js/pedir.js`: regla de Lógica, redondeo al bulto, Mis pedidos dentro de Pedir, corte de proveedor. SQL aparte si hace falta.
    - Aceptación: con historial trae "Pedir N"; sin historial vacío con aviso; encargado sin precios; nuevo `scripts/verify-sugerido.js` con 3 casos (con historial, sin historial, con pedido sin recibir).
5. **Fase 5 · Hoja más simple y avisos (3 h).** `stock/js/hoja.js` y `retiros.js`: toque en fila abre Entró / Devolví / Merma; aviso de número raro; Deshacer.
    - Aceptación: una acción visible por fila; `verify-hoja.js`, `e2e-hoja.js`, `e2e-shopping.js` verdes.
6. **Fase 6 · Compras con un estado y recibir contra lo pedido (5 h).** `g-pedidos.js` y `g-recibir.js`: estados visibles Para aprobar → Para enviar → Enviado → Recibido / Llegó incompleto (mapeo de borrador, aprobada, enviada, recibida, parcial; sin tocar la base). Recibir con lo pedido y "Llegó todo".
    - Aceptación: nunca dos estados a la vez; faltante registrado; `e2e-recibir-factura.js` y `verify-v3-compras.js` verdes.

Opcional: **Fase 7 · Anotar sin señal (4 h)**, cola local para Hoja y Pedir.

**Prompt por fase:** "Ejecutá la Fase N de `docs/plan-rediseno-apple.md`. Un PR, capturas a 390 y 1366 px, verificaciones de la fase. No mergear."

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Encargados se pierden con el cambio | Rutas viejas redirigen; Hoy dice qué tocar; cambio en fases |
| Sugerido propone cantidades malas | Solo con 4 semanas de historial; editable; gerencia aprueba |
| Romper Compras/Pagos | Fase 6 al final, sin tocar la base |
| Una fase grande traba todo | PRs chicos y publicables solos |

## Métricas (desde Supabase)

- Hojas cerradas por día y local: antes vs. 2 semanas después de la Fase 5.
- Pedidos mandados antes del miércoles a la noche sin reclamo.
- % de filas que el encargado deja como las sugirió la app (meta > 70 %).
- Pedidos con faltante registrado al recibir.

## Decisiones pendientes de Jacobo

- [ ] ¿El encargado también recibe mercadería o solo gerencia?
- [ ] ¿Conteo diario de 10 productos clave y completo semanal?
- [ ] ¿Qué tema del muestrario? Si no elige, el oscuro sobrio de este plan.
- [ ] ¿Se hace la Fase 7?
