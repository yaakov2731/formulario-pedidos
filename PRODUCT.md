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

## Stock objetivo y decisiones de compra

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

## Brand

- **Nombre:** Docks del Puerto · Polo Gastronómico. Contexto portuario (Puerto de Frutos).
- **Tono:** claro, directo, operativo. Español rioplatense.
- **GreenFresh:** nuevo local de viandas saludables. Sub-identidad verde/fresca dentro
  del sistema (acento verde, no rebrand de toda la app).

## Anti-references

- El prototipo original (genspark): fondo violeta, header arcoíris animado, botones que
  saltan y escalan, badge de tracking. Eso es exactamente lo que NO queremos.
- SaaS-cream genérico, hero-metric template, tarjetas idénticas en grilla infinita.
