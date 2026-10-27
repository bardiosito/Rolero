# Rolero 1.1.0 · Guardias manuales y móviles

Versión Android 1.1.0, código 2. APK firmado con la misma clave para actualizar la versión anterior.

## Resultado

- 52 pruebas del motor aprobadas: grupos de 3 a 6, límite de 10 R1/R2, identidades y duplicados, postguardia cíclica, sustitución por móviles, turnos, ausencias y migración sin pérdida de datos.
- 8 escenarios de interfaz aprobados: configuración manual, reserva y sustitución, cambio de número de grupos con confirmación, persistencia, respaldos y actualización desde esquema 1.
- 8 comprobaciones en un emulador Android 15 (API 35): inicio, ausencia de calendario mensual, límites, A→D y D→C, móviles en reserva o sustituyendo, apoyo R1, reducción de 6 a 3 y reapertura conservando grupos y emparejamientos.
- La configuración original del emulador se restauró y se comprobó que coincidía exactamente con su copia previa.

El calendario mensual dejó de controlar la aplicación. Se elige la guardia actual y el grupo anterior del ciclo queda de postguardia; A toma el último de los grupos configurados. Los móviles sólo cubren al fijo cuando falta por ausencia o postguardia. R3 y R4 conservan sus asignaciones y se muestran como Rotantes.

Los informes están en `ui-results.json` y `android-results.json`; las capturas también se guardan en esta carpeta. Una interrupción de ADB al copiar una captura se recuperó repitiendo las comprobaciones de persistencia y restaurando los datos anteriores.

APK: `dist/Rolero.apk`, en la raíz del proyecto.

SHA-256: `8A72E9B04FC7F5EFD8AEA8C0D3CBF7C17D2F4594041B77F2EA518DCC26B9AC0C`.

La verificación de esta actualización se hizo en emulador; no se instaló en el teléfono conectado.
