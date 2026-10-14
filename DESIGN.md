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

## Verificación

Conservar IDs, contratos y confirmaciones existentes. Ejecutar las verificaciones
del repositorio y revisar la versión publicada en escritorio y móvil. No enviar
registros ficticios para obtener evidencia visual.
