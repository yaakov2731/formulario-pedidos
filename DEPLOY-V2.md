# Deploy V2

## 1. Verificar local

```powershell
node .\scripts\verify-v2.js
```

Resultado esperado:
- `V2 verification passed.`

## 2. Publicar Apps Script

1. Abrir el Google Sheet maestro.
2. Ir a `Extensiones > Apps Script`.
3. Reemplazar el contenido por [Code.gs](C:\Users\jcbru\OneDrive\Documents\pedidos%20Semanales\Code.gs).
4. Guardar.
5. Ejecutar una vez:
   - `setupPlantillaPro()`
6. Implementar:
   - `Implementar > Nueva implementación > Aplicación web`
   - `Ejecutar como: yo`
   - `Acceso: Cualquiera`
7. Si cambió la URL `/exec`, actualizar `SCRIPT_URL` en [index.html](C:\Users\jcbru\OneDrive\Documents\pedidos%20Semanales\index.html).

## 3. Verificar deploy live

```powershell
node .\scripts\verify-live-v2.js
```

Resultado esperado:
- `Live V2 verification passed.`

Si falla hoy con mensajes como:
- `recepciones missing in live deployment`
- `produccion missing in live deployment`
- `snapshot missing in live deployment`
- `bootstrap missing dashboard_v2 capability`
- `config still exposes legacy local Parrilla`

entonces el `/exec` publicado sigue atrasado respecto del código local.

## 4. Prueba funcional mínima

Con la app publicada:

1. Elegir un local.
2. Cargar un pedido simple y enviarlo.
3. Abrir `Stock` y guardar un conteo real.
   - Confirmar que el guardado cierre rápido y que la lectura del local cambie sin esperar recarga completa.
4. Abrir `Recepción` y registrar al menos un producto.
5. Abrir `Producción` y registrar un parte simple.
6. Abrir `Dashboard` y confirmar:
   - métricas visibles,
   - pedidos abiertos del local,
   - movimientos recientes,
   - riesgos del local,
   - revisión del pedido actual.

## 5. Evidencia de cierre

Para considerar la V2 cerrada, tiene que haber evidencia de:
- `verify-v2.js` pasando en local.
- `verify-live-v2.js` pasando contra el `/exec` activo.
- flujo manual completo `pedido + stock + recepción + producción + dashboard` funcionando.
