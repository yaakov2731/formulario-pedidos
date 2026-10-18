# Despliegue V3 · paso a paso

La V3 es independiente de la app actual. Publicarla no cambia nada de lo que usan hoy los encargados.

## 1. Backend (una sola vez, unos 5 minutos)

1. Abrir la planilla **Docks · Abastecimiento V3 (pruebas)** (ID en `CONTRATO.md` §0.1). Se puede renombrar.
2. Menú **Extensiones → Apps Script**. Se abre un proyecto vinculado a esa planilla.
3. Borrar el contenido de `Código.gs` y pegar el archivo completo `v3/apps-script/DocksV3.gs`
   (en GitHub: abrir el archivo y usar el botón **Copy raw file**). Guardar con Ctrl+S.
4. Elegir la función **`instalarV3`** en la barra superior y tocar **Ejecutar**. Aceptar los permisos
   (Google avisa "app no verificada": Configuración avanzada → Ir a … → Permitir; es tu propio script).
   Crea las 9 pestañas, carga los locales y genera la **clave de gerencia**, que aparece en el
   **Registro de ejecución**. Guardarla. Se puede ejecutar de nuevo sin perder datos ni cambiar la clave.
5. **Implementar → Nueva implementación →** engranaje **Aplicación web**. Ejecutar como: *yo*.
   Quién tiene acceso: *cualquier persona*. **Implementar** y copiar la URL que termina en `/exec`.

Opcional, en **Configuración del proyecto → Propiedades de la secuencia de comandos**:
`TELEGRAM_BOT_TOKEN` y `TELEGRAM_CHAT_ID` para avisos. La clave `ADMIN_KEY` también se cambia ahí.
El manifiesto `appsscript.json` no hace falta tocarlo: el acceso se elige en el paso 5.

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
