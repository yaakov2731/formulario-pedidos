# PRODUCT.md — Sistema de Pedidos · Polo Gastronómico Docks del Puerto

register: product

## Product Purpose

Herramienta interna de requisición semanal de insumos. Cada encargado de local del
Polo Gastronómico Docks del Puerto (Puerto de Frutos, Tigre, Buenos Aires) carga su
pedido de mercadería de la semana. El pedido se registra en un Google Sheet maestro
(hoja `PEDIDOS RECIBIDOS`) que gerencia consolida en órdenes de compra por proveedor.

Es una pieza de un sistema más grande de procurement gastronómico: catálogo de
productos, control de stock, proveedores, órdenes de compra y dashboard gerencial ya
viven en el mismo Google Sheet.

## Users

- **Primario:** encargados de local (Parrilla, GreenFresh, Heladería, Cafetería,
  Hamburguesería, Eventos, Shopping). Cargan desde el celular, apurados, dentro del
  local, con luz de día. Conocimiento técnico bajo. Velocidad y claridad > features.
- **Secundario:** gerencia / compras. Consume los pedidos en el Sheet para generar
  órdenes de compra. Necesita datos limpios y estandarizados (producto, proveedor,
  cantidad, costo estimado), no texto libre con errores de tipeo.

## Strategic Principles

1. **Catálogo primero, texto libre como escape.** El form sugiere productos reales del
   catálogo del local (autocompleta unidad, proveedor, código, precio). Si el producto
   no está, se permite carga libre. Nunca bloquear un pedido por catálogo incompleto.
2. **Datos limpios aguas abajo.** Estandarizar producto/unidad/proveedor reduce el
   trabajo manual de gerencia al armar órdenes de compra.
3. **Mobile real, no "mobile responsive de adorno".** El uso primario es teléfono en mano.
4. **Profesional, no decorativo.** Es una herramienta de trabajo, no una landing.

## Referencias de operación consultadas · 14 de octubre de 2026

[Restaurant365](https://docs.restaurant365.com/docs/r365-app-creating-an-order)
separa listas por local, muestra unidad, proveedor, existencias y par, y exige
revisión antes de enviar. [MarketMan](https://www.marketman.com/platform/restaurant-purchasing-software-and-order-management)
vincula compra y recepción desde el móvil. Se adoptan como criterios de flujo,
no como integraciones contratadas ni como prueba de que Docks ya tenga todo eso.

Aplicación a Docks: catálogo local primero, navegación móvil explícita, medidas
visibles y confirmación separada de la carga. El menú de secciones móvil muestra
todas las categorías sin descubrir un carrusel oculto. El historial libre agrupa
variaciones de nombre sólo con la misma unidad; no suma frecuencias posiblemente
solapadas ni cantidades, no inventa conversiones y no modifica la planilla.
El vínculo de recepción por pedido y el envío directo a proveedores no están
implementados y requieren contratos operativos específicos antes de agregarse.

## Stock objetivo y decisiones de compra

Reportes cuenta acciones de abastecimiento como compras sugeridas más revisiones,
dos grupos excluyentes del cálculo por producto. No mezcla ese total con cantidad
de líneas del borrador o faltantes de otras vistas. Las alertas indican su origen
(pedido, saldo, conteo o stock); su posición en la lista no implica gravedad.

`Stock_Actual` del catálogo es el saldo operativo: los conteos lo fijan, las
recepciones lo aumentan y la producción lo reduce. Los reportes y decisiones usan
ese saldo; recurren al último conteo histórico sólo cuando el catálogo no tiene
un valor numérico. Cero y negativos no se sustituyen por conteos anteriores.

El catálogo permite editar nombre, categoría, unidad, proveedor y stock objetivo
(par) desde la configuración existente. El objetivo usa la columna `Stock_Mínimo`
por producto y local; vacío significa sin definir y cero sigue siendo un valor válido.
El guardado sólo se confirma cuando la lectura del backend coincide con los campos
solicitados. Editar el catálogo no modifica el stock real ni los movimientos previos.

La sugerencia calcula `máximo(pedidos abiertos, cantidad habitual, par) - stock real`,
con un piso de cero. Si falta stock confiable, propone contar. La cantidad habitual
es historial de pedidos, no consumo medido ni pronóstico de ventas. Las sugerencias
se incorporan al borrador y requieren la confirmación del encargado para enviarse.

Validación de esta regla: `node scripts/verify-par.js`, con planilla en memoria.

## Guía de recepción

Recepción permite filtrar todo el catálogo, productos con pedidos abiertos o líneas
con cantidad recibida en la carga actual. La búsqueda incluye producto, código,
categoría y proveedor y tolera acentos.

La referencia agrupa todas las líneas abiertas por local, código y unidad. No usa
la lista resumida de ocho movimientos del inicio. Al ingresar una cantidad, muestra
su diferencia frente a esa referencia; si hay unidades distintas evita compararlas.
Las recepciones históricas no tienen vínculo por pedido, por lo que esta guía no
afirma cuánto falta entregar ni cambia estados de pedidos. El encargado registra
la cantidad realmente recibida, que sigue alimentando el stock mediante el flujo existente.

Validación: `node scripts/verify-reception-guide.js`, sin escrituras en producción.

Al cargar una foto se conservan las cantidades manuales ya escritas, incluido cero,
y el proveedor manual. El lector prioriza una cantidad explícita con medida sobre
el código numérico del artículo; si hay varias cantidades medidas, no precarga esa
línea y el operador debe completarla manualmente. Las
pruebas de texto transcrito están en `verify-unit-quantities.js`: no prueban la
calidad de reconocimiento de la foto completa ni la extracción externa.

El filtro exige encontrar líneas de artículos antes de dar por válida una tabla:
un pie de factura mal leído como encabezado no reemplaza el detalle. Productos
reconocidos con presentaciones multiplicadas se muestran en «Productos por revisar»
con su línea original y acceso a la grilla. No precargan una cantidad ni se convierten
a la unidad del catálogo. La extracción externa no omite esa revisión local.

## Borradores por local

Cada local conserva su propio pedido en el dispositivo: productos, cantidades,
responsable, email, semana, entrega, prioridad y notas. Cambiar de local recupera
su borrador sin trasladar datos del anterior. La migración conserva el borrador
antiguo bajo el local con el que fue guardado, sin atribuirlo a otro automáticamente.

Si un código no pertenece al catálogo del local, el pedido requiere revisión antes
de enviar y el backend rechaza la línea. Los productos libres siguen disponibles.
El éxito requiere confirmación del pedido por ID; un refresco del catálogo no prueba
que el pedido se haya guardado. Si la confirmación falla, se conserva la carga.

Validación: `node scripts/verify-local-drafts.js`, con almacenamiento y backend en memoria.

## Catálogo según los pedidos de cada local

La vista inicial `Ya pedidos` muestra productos del catálogo con historial positivo,
no cancelado, del local seleccionado y en su unidad. `Otros del local` permite
consultar sus productos todavía sin historial. Buscar recorre todo el catálogo
propio, aunque el producto no se haya pedido antes. Nunca se copia el catálogo
de una parrilla a una cafetería ni se usan productos de ejemplo al iniciar.

Los productos históricos fuera de catálogo se consultan en una sección separada.
Se agregan como líneas libres con cantidad inicial 1 para revisión, conservando la
unidad original; no se mezclan kg, paquetes ni unidades para sugerir cantidades.
Los códigos pertenecientes exclusivamente a otro local se excluyen del aprendizaje
y se rechazan al enviar incluso si la línea declara ser libre. Los registros históricos
no se borran ni se cambian de local. Las variantes de escritura del nombre de un
local se unifican sin sobrescribir sus productos.

Validación: `node scripts/verify-local-catalog.js`, sin escrituras de datos operativos.

## Lectura de cantidades por unidad

Stock y pedido muestran subtotales separados por unidad de medida. Sólo se unifican
mayúsculas/minúsculas y espacios; no se convierten gramos, kg, cajas ni litros.
Una cantidad vacía o inválida no equivale a cero. Una cantidad sin unidad se marca
para revisión sin sumarla a otras cantidades indefinidas. Los saldos negativos
siguen visibles y exigen revisar el conteo, no una sugerencia de compra.

El stock de los productos del pedido se cuenta una vez por producto del catálogo;
las líneas libres no crean un saldo de inventario por coincidencia de nombre.
Los borradores conservan unidades originales. Los acumulados históricos que no
permiten reconstruir medidas se presentan por registro/producto, no como un total
ficticio de unidades. Esta lectura no cambia datos de la planilla.

Validación: `node scripts/verify-unit-quantities.js`, con datos en memoria.

Los pedidos abiertos se agrupan por su medida original. Si difiere del catálogo,
falta la unidad o la cantidad no es válida, la app muestra «Medidas por revisar»
y no propone una compra automática, ni desde el historial ni desde el objetivo.
«Ver referencia» abre las líneas del local en Recepción, sin registrar movimientos.
El consolidado conserva cajas y litros como renglones distintos; no convierte medidas.

## Brand

- **Nombre:** Docks del Puerto · Polo Gastronómico. Contexto portuario (Puerto de Frutos).
- **Tono:** claro, directo, operativo. Español rioplatense.
- **GreenFresh:** nuevo local de viandas saludables. Sub-identidad verde/fresca dentro
  del sistema (acento verde, no rebrand de toda la app).

## Anti-references

- El prototipo original (genspark): fondo violeta, header arcoíris animado, botones que
  saltan y escalan, badge de tracking. Eso es exactamente lo que NO queremos.
- SaaS-cream genérico, hero-metric template, tarjetas idénticas en grilla infinita.
