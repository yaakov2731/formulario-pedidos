# Despliegue V3 · paso a paso

La V3 es independiente de la app actual. Publicarla no cambia nada de lo que usan hoy los encargados.

## 1. Backend (una sola vez, unos 5 minutos)

1. Abrir la planilla **Docks · Abastecimiento V3 (pruebas)** (ID en `CONTRATO.md` §0.1). Se puede renombrar.
2. Menú **Extensiones → Apps Script**. Se abre un proyecto vinculado a esa planilla.
3. Borrar el contenido de `Código.gs` y pegar el archivo completo `v3/apps-script/DocksV3.gs`
   (en GitHub: abrir el archivo y usar el botón **Copy raw file**). Guardar con Ctrl+S.
4. Elegir la función **`instalarV3`** en la barra superior y tocar **Ejecutar**. Aceptar los permisos
   (Google avisa "app no verificada": Configuración avanzada → Ir a … → Permitir; es tu propio script).
   Crea las 11 pestañas, carga los locales y genera la **clave de gerencia**, que aparece en el
   **Registro de ejecución**. Guardarla. Se puede ejecutar de nuevo sin perder datos ni cambiar la clave.
5. **Implementar → Nueva implementación →** engranaje **Aplicación web**. Ejecutar como: *yo*.
   Quién tiene acceso: *cualquier persona*. **Implementar** y copiar la URL que termina en `/exec`.

Opcional, en **Configuración del proyecto → Propiedades de la secuencia de comandos**:
`TELEGRAM_BOT_TOKEN` y `TELEGRAM_CHAT_ID` para avisos. La clave `ADMIN_KEY` también se cambia ahí.
El manifiesto `appsscript.json` no hace falta tocarlo: el acceso se elige en el paso 5.

Comprobar la instalación sin escribir datos (desde una PC con Node):

```
node scripts/verify-live-v3.js
```

Debe terminar con `Live V3 verification passed.`.

### Actualizar el backend después de un cambio

1. Pegar de nuevo `v3/apps-script/DocksV3.gs` completo sobre el código del editor y guardar.
2. **Implementar → Gestionar implementaciones →** lápiz de la implementación existente → Versión: **Nueva versión** → **Implementar**.
   Así la URL `/exec` no cambia. Si Google pide permisos nuevos, aceptarlos.
3. Con los secretos `GAS_V3_SCRIPT_ID` y `GAS_V3_DEPLOYMENT_ID` cargados en GitHub (§3), esto lo hace el workflow solo.
4. Si la planilla se instaló antes de la etapa **Elaborados** (18/10/2026), no hace falta nada más: las pestañas
   `ELABORADOS` y `CONTEO_ELABORADOS` se crean solas la primera vez que alguien abre la pestaña Elaborados.
   También se pueden crear a mano ejecutando `setupV3` (o el menú **Docks V3 → Preparar o reparar planilla**).

### Si la app dice "No se pudo conectar con la planilla"

Probar en orden, desde cualquier navegador (sin iniciar sesión hace falta nada):

1. Abrir la `API_URL` de `v3/config.js` agregando `?action=ping`. Debe mostrar `{"ok":true,"version":"v3","hora":"…"}`.
   - Si aparece una pantalla de **inicio de sesión de Google** o "No tienes permiso": la implementación quedó con
     *Quién tiene acceso: Solo yo*. En **Implementar → Gestionar implementaciones → lápiz**, cambiar a *Cualquier persona*
     e implementar de nuevo (misma URL).
   - Si dice **"No se encontró la secuencia de comandos"** o "página no encontrada": esa implementación se borró o archivó.
     Crear o reactivar una y pegar su URL `/exec` en `v3/config.js` (merge a `main`).
   - Si dice **"Se requiere autorización"** o un error de permisos: abrir el editor, ejecutar `instalarV3` una vez y aceptar
     los permisos; después **Nueva versión** sobre la misma implementación.
   - Si devuelve `{"ok":false,"error":"Falta la pestaña …"}`: el script quedó apuntando a otra planilla. Debe estar vinculado
     a la planilla V3 (Extensiones → Apps Script desde esa planilla) o tener la propiedad `SHEET_ID` con su ID.
2. Si el `ping` responde bien pero un celular sigue sin conectar: ese equipo tenía fijada una URL vieja con `?api=`.
   Abrir la app una vez con `?api=` (vacío) para borrarla, o simplemente recargar: desde el 22/10/2026 la app descarta
   sola la URL fijada cuando `config.js` cambió de backend.
3. Desde una PC con Node: `node scripts/verify-live-v3.js` recorre todas las lecturas y dice exactamente qué falla.
4. La pestaña `LOG` de la planilla V3 registra sólo escrituras (conteos, pedidos, órdenes). Si la última fila es vieja,
   nadie pudo guardar desde esa fecha; las lecturas fallidas no quedan registradas ahí.

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
5. **Elaborados** (opcional, p. ej. Umo Grill): cargar en Compras → Elaborados lo que produce el local (bondiola,
   pollo, salsas…) o dejar que el encargado los agregue desde la pestaña Elaborados del celular. Al cierre, el
   encargado anota cuánto quedó **listo**, **marcado** o **crudo**; gerencia lo ve en Compras → Elaborados y en
   el bloque 6 del TABLERO.

## 5. Desarrollo local

```
node scripts/v3-dev-server.js --seed
```

Abrir `http://localhost:8787/?api=/api` (encargado) y `http://localhost:8787/compras.html?api=/api` (gerencia, clave `dev`).
Todo corre en memoria: no escribe en ninguna planilla.
