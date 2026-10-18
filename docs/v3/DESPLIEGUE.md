# Despliegue V3 · paso a paso

La V3 es independiente de la app actual. Publicarla no cambia nada de lo que usan hoy los encargados.

## 1. Backend (una sola vez, unos 15 minutos)

1. Abrir la planilla **Docks · Abastecimiento V3 (pruebas)** (ID en `CONTRATO.md` §0.1). Se puede renombrar.
2. Menú **Extensiones → Apps Script**. Se abre un proyecto vinculado a esa planilla.
3. Borrar el contenido de `Código.gs` y pegar el archivo completo `v3/apps-script/DocksV3.gs` del repositorio.
4. Engranaje **Configuración del proyecto**: tildar "Mostrar el archivo de manifiesto appsscript.json",
   volver al editor y reemplazar `appsscript.json` por `v3/apps-script/appsscript.json`.
5. En **Configuración del proyecto → Propiedades de la secuencia de comandos**, agregar:

   | Propiedad | Valor |
   | --- | --- |
   | `ADMIN_KEY` | una clave para gerencia (no compartirla con encargados) |
   | `TELEGRAM_BOT_TOKEN` | opcional |
   | `TELEGRAM_CHAT_ID` | opcional |

6. En el editor, elegir la función `setupV3` y **Ejecutar**. Aceptar los permisos. La planilla queda con 9 pestañas
   y los locales cargados. Se puede ejecutar de nuevo sin perder datos.
7. **Implementar → Nueva implementación → Aplicación web**. Ejecutar como: *yo*. Acceso: *cualquier persona*.
   Copiar la URL que termina en `/exec`.

## 2. Frontend

- Pegar la URL `/exec` en `v3/config.js` (`API_URL`) y hacer merge a `main`: el workflow publica
  `https://yaakov2731.github.io/formulario-pedidos/v3/` (encargados) y `.../v3/compras.html` (gerencia).
- Para probar antes del merge, en cualquier navegador: abrir la página con `?api=<URL /exec>`; queda guardada en ese equipo.

## 3. Publicación automática del backend (opcional)

El workflow tiene el job `deploy-gas-v3`, que se saltea solo mientras no existan estos secretos de GitHub:
`GAS_V3_SCRIPT_ID` (Configuración del proyecto → ID de la secuencia de comandos) y `GAS_V3_DEPLOYMENT_ID`
(Implementar → Gestionar implementaciones → ID). Usa las mismas credenciales `CLASP_CREDENTIALS` del backend actual.
Con los secretos cargados, cada merge a `main` publica `v3/gas/` sobre la misma URL `/exec`.

## 4. Primera carga de datos (gerencia, en `compras.html`)

1. **Proveedores**: "Pegar desde Excel" con columnas Proveedor, Contacto, WhatsApp, Email, Días de entrega, Pedido mínimo.
2. **Catálogo**: elegir local y "Pegar desde Excel" con columnas Producto, Categoría, Unidad, Proveedor, Precio, Par.
3. **Locales**: revisar activos, día y hora de corte, y cargar los encargados.
4. Pedir a cada encargado un primer **conteo** desde el celular: sin conteo no hay sugerido.

## 5. Desarrollo local

```
node scripts/v3-dev-server.js --seed
```

Abrir `http://localhost:8787/?api=/api` (encargado) y `http://localhost:8787/compras.html?api=/api` (gerencia, clave `dev`).
Todo corre en memoria: no escribe en ninguna planilla.
