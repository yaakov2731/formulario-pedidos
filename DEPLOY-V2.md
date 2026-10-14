# Publicación y aceptación operativa

## 1. Verificar localmente

Ejecutar las nueve verificaciones locales documentadas en `README.md`. Todas deben
terminar correctamente. Comprobar el diff y preservar cambios ajenos a la tarea.

No existe un `Code.gs` único: el backend publicado vive en `gas/*.gs`.

## 2. Publicar la implementación existente

El workflow `.github/workflows/deploy.yml` se ejecuta al actualizar `main`:

1. Ejecuta los tests locales antes de permitir ambos despliegues.
2. Aplica las rutas administrativas mediante `scripts/patch_admin_backend.py`.
3. Publica `gas/` con clasp y actualiza el deployment identificado por `SCRIPT_URL`.
   Usa secretos configurados en GitHub; no copiarlos en archivos versionados ni logs.
4. Empaqueta sólo `index.html`, `admin.js` y `favicon.svg` como artefacto de Pages.
5. Publica directamente mediante `actions/deploy-pages`; esperar el job
   `deploy-frontend`, que ahora incluye la publicación real, no sólo una copia a rama.

La fuente de Pages debe ser GitHub Actions (`build_type: workflow`). El entorno
`github-pages` permite la rama `main`. El job sólo solicita lectura de código y
los permisos de Pages/OIDC necesarios para publicar; no escribe en `gh-pages`.
Ante un fallo, la versión pública anterior sigue disponible. Para volver atrás,
revertir el commit autorizado en `main` y desplegar por el mismo workflow.

Una actualización habitual no requiere ejecutar `setupPlantillaPro()` ni
`setupVersion2UI()`: esas funciones migran o reconstruyen planillas. No ejecutar
`resetOperationalData()`. Una inicialización o migración necesita respaldo y revisión
explícita de los datos afectados, fuera del despliegue habitual.

Si falla la publicación automática, inspeccionar el job antes de cambiar la URL
o crear otro deployment. Si se autoriza cambiar `/exec`, actualizar `SCRIPT_URL`,
publicar el frontend y verificar ambos destinos nuevamente.

## 3. Verificar producción

```powershell
node .\scripts\verify-live-v2.js
```

Debe terminar con `Live V2 verification passed.`. Comprueba versión, capacidades,
datos por local, stock operativo y ausencia de recomendaciones con códigos ajenos.
Un timeout o error de red no prueba que el backend esté atrasado: distinguirlo de
una respuesta con versión o capacidades incorrectas.

Confirmar también que el HTML servido por Pages corresponde al commit previsto.
Un workflow exitoso no prueba por sí solo que el operador vea la versión correcta.

## 4. Aceptación visual y funcional

Primero recorrer sin guardar en escritorio y móvil: Inicio, Pedido, Stock, Recepción,
Producción, Elaborados y Reportes. Cambiar entre Umo y Trento: catálogo, historial y
borrador deben pertenecer al local elegido. Buscar productos propios sin historial
debe funcionar en `Otros del local` y en la búsqueda.

Para escrituras, usar datos operativos reales aprobados por el operador.
No inventar pedidos, responsables, stock o remitos para obtener un test verde:

1. Registrar local, responsable, semana y entrega del pedido autorizado.
2. Revisar y enviar. Confirmar el mismo ID con `getPedidoStatus`, comparando local,
   responsable y productos. Una recarga exitosa no prueba el guardado.
3. Guardar el conteo real y confirmar su ID con `getOperationStatus&type=stock`.
4. Registrar la recepción real y confirmar su ID con `type=recepcion`.
5. Registrar el parte real de producción y confirmar su ID con `type=produccion`.
6. Para elaborados, confirmar el ID con `type=elaborados`.
7. Comparar el saldo por producto y unidad: conteo + recepción − consumo.
   Revisar actividad y decisiones de Reportes. No sumar kg y unidades.
8. Comprobar edición autorizada de responsable y catálogo con confirmación persistida;
   el operador debe introducir personalmente cualquier código de autenticación.

Los envíos pueden notificar a Telegram y modificar la planilla: ejecutar sólo las
operaciones aprobadas. Si falta aprobación o acceso, documentar la prueba pendiente;
no declarar aceptación integral ni eliminar registros para ocultarla.

## 5. Evidencia de cierre

Conservar versión, commit, resultados completos de verificaciones, workflows de
ambos despliegues y evidencia visual de la misma revisión. Para escrituras, conservar
IDs confirmados y comparación de saldos. Las capturas con datos operativos quedan
fuera del repositorio público. Los tests en memoria y las consultas de estado
no sustituyen ese recorrido de guardado real.
