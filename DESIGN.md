# Docks del Puerto · Cocina de servicio

## Revisión visual vigente: 16 de octubre de 2026

Reemplaza Cobalto. Motivo: la hoja acumulaba ocho rediseños superpuestos
(158 KB de CSS que se pisaban entre sí) y el resultado se leía genérico.
Ahora hay una sola hoja, escrita desde cero, con los mismos nombres de clase.

Referencia: la cocina profesional. Acero como fondo, verde río (Delta de Tigre)
para acciones, y la cinta de papel con la que se rotulan los envases como único
acento: marca lo que ya está en el pedido (borde y cantidad), el contador de la
barra y el botón principal de la barra de comanda.

| Rol | Valor | Uso |
| --- | --- | --- |
| Acero | #E8ECEA | Fondo de trabajo |
| Superficie | #FFFFFF | Listas, formularios |
| Tinta | #1E2A27 | Texto, navegación, barra de comanda |
| Río | #0F5C52 | Acción principal, selección |
| Cinta | #F3C94B | Productos en el pedido y botón de la barra |
| Rojo / ámbar / verde | #B3261E / #8A5300 / #1D6B45 | Sólo estados, siempre con texto |

Tipografía: Barlow (texto) y Barlow Semi Condensed (títulos, nombres de
producto y cantidades): legible a la luz del día y entra más producto por
línea en el celular. Números tabulares. Radios 6–8 px, sin sombras salvo
diálogos y sugerencias.

Celular: barra superior con local y conexión, búsqueda fija al hacer scroll,
sección y orden en una fila, filas de producto de una línea con stepper de
46 px y barra de comanda oscura. Escritorio: barra lateral oscura con
secciones del catálogo a la izquierda. Sin numeración decorativa (01, 02).

Flujo: la revisión completa semana actual y entrega para mañana si están
vacías (nunca pisa valores cargados). La última lectura completa de la
planilla se guarda en el equipo y se muestra al abrir mientras Apps Script
responde; guardar sigue exigiendo conexión. El lector de fotos (Tesseract)
se descarga al abrir Recepción, no al cargar la app.

Se conservan IDs, contratos, borradores y confirmaciones existentes.

## Revisión anterior: Cobalto (sustituida)

Esta dirección reemplaza la paleta oliva documentada abajo. La skill impeccable
orienta la jerarquía, los estados y el color con función. Registro: product.
Encargados cargan desde el celular, dentro del local y con luz de día: lectura
clara, navegación oscura en escritorio y cobalto para acción y selección.

Tokens OKLCH hacia 265 grados: fondo 97% .008, superficie 99.5% .003,
tinta 25% .027, acción 48% .22, hover 39% .18 y navegación 24% .033.
Verde, ámbar y rojo tienen funciones semánticas y siempre texto explicativo.
Inicio agrupa alertas en filas y destaca sólo Nuevo pedido. Sin grilla de
tarjetas decorativas, hero promocional ni métricas gigantes. Geist, títulos
23–28 px, radios 7–10 px y controles de al menos 44 px. Catálogo en superficie
clara continua; secciones laterales en escritorio y selector nativo en móvil.

Se conservan contratos, IDs, unidades, borradores y confirmaciones existentes.
El aviso de consentimiento externo para comprobantes sigue explícito.

## Referencia anterior (sustituida visualmente)

## Dirección

Interfaz de abastecimiento, no página promocional. Lectura rápida para encargados
que trabajan con productos, cantidades, responsables y fechas. Sin títulos de
campaña, promesas de inteligencia, paneles decorativos ni estética de restaurante.

La skill design-taste-frontend orientó la calibración de color, tipografía,
jerarquía y reducción de elementos genéricos. Se mantiene HTML/CSS/JavaScript
sin framework adicional. Movimiento mínimo: sólo respuesta a interacción.

## Paleta

| Rol | Valor | Uso |
| --- | --- | --- |
| Fondo | #f8f7f3 | Marfil, superficie de trabajo |
| Panel | #ffffff | Formularios y lectura de datos |
| Tinta | #282b25 | Texto principal |
| Navegación | #f0efe9 | Barra lateral clara |
| Secundario | #606258 | Descripciones |
| Borde | #ddded4 | Separación funcional |
| Acento | #576044 | Oliva apagado, acciones y selección |
| Acento profundo | #3e472f | Texto sobre selección tenue |

Un solo acento de identidad. Rojo y ámbar se reservan para errores y advertencias,
no para decorar locales. Sin vino, terracota, gradientes, papel cuadriculado,
cortes diagonales ni sombras de colores.

## Tipografía

Geist con fallback system-ui / Segoe UI. Todos los módulos usan sans serif;
las métricas usan monospace. Encabezados de 20–22 px, cuerpo de 12–14 px.
Los estados se distinguen por texto además del color. Foco visible y controles
táctiles de al menos 44 px.

## Inicio y navegación

Encabezado sin tarjeta ni banner: “Pedidos semanales” y selector de locales.
“Por revisar” muestra alertas en filas, con datos confirmados y aviso de conexión.
Los seis módulos aparecen como filas, con nombre y descripción concreta.
Pedido no ocupa una tarjeta promocional sobredimensionada.

En móvil el selector y las métricas pasan a dos columnas, las alertas a filas y los módulos
conservan su orden. Menú y barra de acciones mantienen los flujos existentes.

## Texto y estados

Usar nombres concretos: Nuevo pedido, Stock, Recepción, Producción, Sobrantes y
Reportes. Evitar encabezados de campaña y subtítulos repetidos. Métricas sin cajas
elevadas, controles de recepción compactos, títulos y cifras proporcionados.
Lectura de remitos sin exponer proveedores de IA ni nombres de modelos.
Los estados de carga, error, conexión y guardado siguen explícitos.

## Catálogo por actividad

Trento Café abre en Café y barra, no en un ranking de compras mezcladas. Sus
productos existentes se organizan por uso: Pastelería, Insumos de pastelería,
Sándwiches y cocina, Frutas y licuados, Descartables y Limpieza. La agrupación
es una vista; conserva códigos, nombres, unidades y registros de la planilla.
Las categorías de origen pueden ser incorrectas (por ejemplo mayonesa en
Lácteos); la vista prioriza el producto. Los nuevos productos no reconocidos
quedan en Otros insumos, sin inventar pertenencia.

Menú lateral de secciones en escritorio y selector nativo rotulado en móvil,
con todas las secciones y sus cantidades visibles al desplegarlo.
Cada producto muestra su unidad junto al nombre. Buscar recorre todo el catálogo
del local, independientemente de la sección activa. Todos y Frecuentes permiten
explorar el catálogo completo o los productos con pedidos anteriores reales.
Historial sin catalogar es una sección explícita, no una recomendación. Las
referencias de cortes de parrilla sin código que coincidan con el catálogo de
otro local no se ofrecen a Trento. Bebidas e insumos compartidos siguen en su
historial. No se borran registros ni se fusionan stocks duplicados.

## Verificación

Conservar IDs, contratos y confirmaciones existentes. Ejecutar las verificaciones
del repositorio y revisar la versión publicada en escritorio y móvil. No enviar
registros ficticios para obtener evidencia visual.
