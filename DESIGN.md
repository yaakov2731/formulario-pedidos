# Diseño operativo · Docks del Puerto

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
| Fondo | #f4f5f6 | Superficie neutra de trabajo |
| Panel | #ffffff | Formularios y lectura de datos |
| Grafito | #22282b | Texto principal |
| Navegación | #242b2e | Barra lateral |
| Secundario | #596267 | Descripciones |
| Borde | #dce1e3 | Separación funcional |
| Acento | #28564b | Acciones y selección |
| Acento profundo | #1c4037 | Texto sobre selección tenue |

Un solo acento de identidad. Rojo y ámbar se reservan para errores y advertencias,
no para decorar locales. Sin vino, terracota, gradientes, papel cuadriculado,
cortes diagonales ni sombras de colores.

## Tipografía

Geist con fallback system-ui / Segoe UI. Todos los módulos usan sans serif;
los números usan cifras tabulares. Encabezados de 23–28 px, cuerpo de 12–14 px.
Los estados se distinguen por texto además del color. Foco visible y controles
táctiles de al menos 44 px.

## Inicio y navegación

Encabezado compacto con “Pedidos y abastecimiento” y selector de locales.
“Pendientes del local” usa datos confirmados y avisa si falta conexión.
Los seis módulos aparecen como filas, con nombre y descripción concreta.
Pedido no ocupa una tarjeta promocional sobredimensionada.

En móvil el selector pasa a dos columnas, las alertas a una columna y los módulos
conservan su orden. Menú y barra de acciones mantienen los flujos existentes.

## Texto y estados

Usar nombres concretos: Nuevo pedido, Productos y cantidades, Revisión del pedido,
Recepción de mercadería, Registro de producción, Registro de sobrantes y Resumen
del local. Lectura de remitos sin exponer proveedores de IA ni nombres de modelos.
Los estados de carga, error, conexión y guardado siguen explícitos.

## Verificación

Conservar IDs, contratos y confirmaciones existentes. Ejecutar las verificaciones
del repositorio y revisar la versión publicada en escritorio y móvil. No enviar
registros ficticios para obtener evidencia visual.
