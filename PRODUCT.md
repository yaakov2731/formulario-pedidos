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

## Brand

- **Nombre:** Docks del Puerto · Polo Gastronómico. Contexto portuario (Puerto de Frutos).
- **Tono:** claro, directo, operativo. Español rioplatense.
- **GreenFresh:** nuevo local de viandas saludables. Sub-identidad verde/fresca dentro
  del sistema (acento verde, no rebrand de toda la app).

## Anti-references

- El prototipo original (genspark): fondo violeta, header arcoíris animado, botones que
  saltan y escalan, badge de tracking. Eso es exactamente lo que NO queremos.
- SaaS-cream genérico, hero-metric template, tarjetas idénticas en grilla infinita.
