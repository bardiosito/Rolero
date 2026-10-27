# Verificación de Rolero en Android

Se verificó la aplicación en un emulador Android 15 (API 35), con pantalla de 720 × 1280 y densidad 320. El proyecto sincroniza en Android Studio y `:app:assembleDebug` compila correctamente con Gradle 9.4.1 y Android Gradle Plugin 9.2.1.

Comprobaciones realizadas:

- Instalación y apertura real en WebView Android, con interfaz dentro de los límites de pantalla.
- Calendario A–D y exclusión de R1/R2 de la guardia del día anterior; Rotantes se conserva.
- Edición de salas QX y residentes, y bloqueo de las acciones hasta confirmar el texto.
- Portapapeles real: se copió el texto y se pegó de nuevo en Android, comparando su contenido completo.
- Selector nativo Compartir con el rol correcto; se canceló sin enviar.
- Atrás cierra el diálogo interno y vuelve a Crear desde Equipo.
- Los cambios se conservan al detener el proceso y reabrir la aplicación.
- Exportación real de un respaldo JSON a Descargas del emulador: 30 254 bytes y 18 médicos.
- Restauración real desde el selector nativo: una nota modificada para la prueba volvió a su valor guardado. Médicos, acentos, configuración, historial y guardias coincidieron exactamente con el respaldo.

También pasaron 33 pruebas del motor y 10 escenarios de interfaz en navegador. Las pruebas Android se ejecutaron por fases para adaptar las esperas a las transiciones del emulador; el informe de respaldo es `backup-results.json` y las capturas se encuentran en esta carpeta.

Correcciones aplicadas:

- Configuración completa de Gradle y wrapper para compilar y ejecutar el módulo `app` desde Android Studio.
- Manejo nativo de Atrás, conectado a los diálogos y pestañas de la interfaz.
- Inspección del WebView habilitada únicamente en compilaciones de depuración.
- El compilador manual sigue generando un APK firmado con la misma clave, con depuración desactivada y sin permiso de Internet.

Los datos temporales se retiraron únicamente del dispositivo de prueba `Rolero_Test35`, después de conservar una copia de recuperación. No se ha realizado una prueba en teléfono físico ni una matriz de todas las versiones Android compatibles.

APK de entrega: `dist/Rolero.apk` (en la raíz del proyecto). SHA-256: `EC1689BFE560098F594640A28689AF57464E8424131E40367078470AFCD71E84`.
