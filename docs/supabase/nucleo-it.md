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
