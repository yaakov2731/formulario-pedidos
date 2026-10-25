# Excel de ventas de Núcleo IT

Muestra recibida el 25/10/2026: Umo Grill, sábado 24/10/2026 (`Pedidos_por_producto_Umo_sabado.xlsx`).

- Una hoja, "Pedidos por producto".
- Fila 2: título. Fila 3: `Exportado:` con fecha y hora de exportación (no es la fecha de venta).
- Fila 5: encabezados `Código | Nombre | Cantidad | Total $`. Datos desde la fila 6 hasta la primera fila vacía.
- Códigos propios de Núcleo por rubro: `ACH-` achuras, `BEB-` bebidas, `CAF-` cafetería, `COC-` cocina, `SAN-` sándwiches, `VIN-` vinos.
- Hay renglones con `Total $` en 0 (por ejemplo Morcilla, Riñón): cantidad vendida sin importe (cortesía o parte de un combo). Se descuentan igual.
- El archivo no dice el local ni la fecha de venta: se eligen al subirlo.

Mapeo a la base: cada fila va a `ventas_items` (`codigo_origen`, `nombre_origen`, `cantidad`, `importe`).
Se asocia a `productos` por `producto_alias` con origen `nucleo` (clave: el código de Núcleo).
Los platos (COC, SAN) descuentan insumos a través de `recetas`; las bebidas suelen ser 1 a 1 con el producto comprado.

## Reporte "Formas de pago de pedidos"

Muestra recibida el 25/10/2026: Umo Grill, sábado 24/10/2026.

- Una hoja, mismo armado: título en la fila 2, `Exportado:` en la fila 3, encabezados en la fila 5.
- Encabezados: `N° de pedido | Fecha | Cliente | Total $ | Forma de pago | Monto $`. `Fecha` trae fecha y hora.
- Si un pedido se paga con dos medios, aparecen dos filas con el mismo número (en la muestra no pasó).
- No trae mozo, mesa ni productos por pedido.

Mapeo: `ventas_pedidos` (número, fecha y hora, cliente, total) y `ventas_pedido_pagos` (forma, monto).

Lo que mostró la muestra: 24 pedidos por $2.130.670, contra $2.082.870 del reporte por producto
(diferencia $47.800, sin explicar todavía). Falta el pedido 3132 en la numeración (3125 a 3149).

## Reporte "Detalle de productos vendidos por pedido" (el recomendado)

Muestra: Umo Grill, sábado 24/10/2026. Reemplaza al de "Pedidos por producto": trae lo mismo, pero ticket por ticket.

- Encabezados (fila 5): `Fecha | N° Pedido | Código | Nombre | Cantidad de productos | Total $ | Rubro | SubRubro | Tipo de pedido | Sector`.
- `Tipo de pedido`: Salón o Mostrador. `Sector`: Salon Umo, Patio Burger, Patio Frente (vacío en Mostrador).
- No trae mozo ni mesa.

Cruce de la muestra con "Formas de pago": los productos suman $2.082.870 y los cobros $2.130.670.
21 pedidos de salón cobran entre $1.000 y $7.000 más que sus productos (total $47.800): probablemente cubierto o servicio de mesa.
El pedido 3132 (16:44, Salon Umo) tiene 27 productos a $0 y ningún cobro: consumo interno o cortesía; descuenta stock igual.

Subir por día y por local: este reporte + "Formas de pago de pedidos".
