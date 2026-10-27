# Rolero

Aplicación Android que prepara el texto del rol matutino y vespertino a partir de las tres imágenes del proyecto. Trabaja sin conexión y guarda los cambios en el teléfono.

El APK de entrega está en **dist/Rolero.apk** y su copia versionada idéntica en **dist/Rolero-1.3.0.apk**. La versión actual es **1.3.0** (código **4**), requiere Android 8 o posterior y utiliza la firma de desarrollo local. Para actualizar conservando los datos, instala el APK sobre la versión anterior con la misma firma.

## Uso

1. En **Crear**, elige fecha y turno. Los días laborables cargan el rol semanal fijo. **Organiza el turno** empieza cerrado; ábrelo para ajustar una actividad, la sala de quirófano o la participación de un médico sólo para ese día. Sus residentes se muestran como referencia y se administran desde Guardias.
2. Revisa o edita la **Vista previa**. **Copiar texto** y **Compartir** están disponibles inmediatamente, incluso cuando todavía no has formado los grupos de guardia. Los médicos aparecen siempre en el texto. Compartir abre el selector de aplicaciones de Android.
3. Activa **Resto de R1 al terminar actividades** cuando necesites añadir a Piso la indicación exacta **(Resto de r1 al terminar actividades)**. El interruptor comienza apagado y conserva tu elección.
4. En **Equipo**, los paneles **Matutino** y **Vespertino** comienzan cerrados. Cada tarjeta muestra el tratamiento, apellido y residentes del médico; al abrirla puedes cambiar tratamiento, apellido y las actividades de lunes a viernes. La vista previa, la copia y el compartir están en Crear.
5. Usa **Añadir médico** dentro del turno correspondiente. El formulario toma ese turno y el nuevo médico comienza sin residentes asignados. **Quitar del equipo** solicita confirmar la eliminación. Se pueden quitar todos los médicos y volver a añadirlos después.
6. Abre **Vacaciones y ausencias** en Equipo. Para un médico, selecciona quién se ausenta y, si corresponde, quién lo cubre; ambas listas reúnen a los médicos de los dos turnos. Añade fecha inicial, fecha final y una nota. La cobertura muestra el nombre del sustituto con la actividad y los residentes del médico ausente. El sustituto conserva también su actividad propia y sus residentes.
7. Para una ausencia de residente, cambia a **Residente**, elige apellido y grado e indica el rango de fechas. Se retira de todas sus asignaciones durante ese periodo, en ambos turnos; vuelve a aparecer fuera de esas fechas.
8. En **Guardias**, elige la **Guardia actual** y el número de grupos, de **3 a 6**. La aplicación nueva empieza con cuatro guardias vacías, A–D. Abre una guardia para cambiar el **Nombre de la guardia** o administrar sus integrantes. Admite hasta **10 integrantes, sólo R1 y R2**, y cada persona pertenece a una sola guardia.
9. Usa **Añadir integrante** para elegir un residente existente sin guardia o crear uno nuevo con nombre y grado. Agregar uno existente conserva sus asignaciones. Los R1 y R2 de los datos iniciales también están disponibles en **Residentes sin guardia**.
10. Abre la tarjeta de un residente para cambiar su nombre, grado o guardia. En **Médicos por turno**, abre Matutino o Vespertino y marca los médicos que correspondan; puedes elegir varios en cada turno y asignar a la misma persona en ambos. **Guardar residente** conserva las selecciones aunque los paneles estén cerrados.
11. **Ascender a R2** actualiza el grado del R1 en todas sus asignaciones activas, ausencias y sustituciones móviles. **Ascender a R3** solicita confirmar y retira a esa persona de los turnos, apoyos, ajustes diarios, guardias, ausencias y sustituciones activas. **Quitar residente** también solicita confirmar una baja global. Los textos históricos y datos antiguos de respaldo se conservan.
12. El botón superior de respaldo permite exportar e importar toda la configuración en JSON.

El texto sigue el ejemplo del usuario: «Rol TM» / «Rol TV», bloques Quirófano, Consulta, Urg y Piso; barras entre integrantes y sala antes del médico. Los R3/R4 predefinidos se agrupan como **Rotantes**, seguidos de los R2 y los R1. El ascenso de un R2 administrado desde Guardias lo retira del conjunto activo; no crea un Rotante nuevo. No se envían mensajes automáticamente.

**Postguardia por ciclo:** el grupo anterior a la guardia seleccionada queda de postguardia automáticamente. Con cuatro grupos, A toma D y D toma C; con tres, A toma C; con seis, A toma F. Sus R1 y R2 se excluyen de las combinaciones y apoyos de ambos turnos. La fecha determina el rol semanal y las ausencias; no calcula ni avanza las guardias. La selección de guardia está únicamente en Guardias.

**Residentes y móviles:** Guardias es el único lugar para editar residentes y sus asignaciones. El cambio de nombre o grado actualiza las referencias activas de esa persona. Los emparejamientos móviles configurados previamente mantienen su funcionamiento: sustituyen al fijo emparejado cuando está ausente o de postguardia, aparecen como **(móvil)** y quedan en reserva si el fijo está disponible. Un móvil ausente o de postguardia no cubre. Las sustituciones existentes se conservan; su editor no aparece en la interfaz. El retiro confirmado de un residente elimina también las sustituciones en las que participaba.

**Datos conservados:** los apoyos R1 por servicio, las notas anteriores de Piso y el historial siguen formando parte de los datos y respaldos, aunque no tienen editor propio. Los R3 y R4 predefinidos conservan su médico y se presentan como Rotantes.

**Respaldos y actualización:** el formato sigue siendo **esquema 3**; la versión 1.3.0 no requiere un esquema nuevo. Los respaldos de esquemas 1 y 2 se migran conservando médicos, roles, combinaciones, ajustes diarios, ausencias, apoyos, notas, historial y los móviles existentes. Se mantienen las reglas de la interfaz: médicos visibles, postguardia automática y texto sin bloque de guardia ni fecha añadida. El recordatorio de Piso comienza apagado al migrar una versión que no lo tenía.

Si un respaldo de esquema 1 contiene un calendario confirmado, sus R1/R2 se recuperan como integrantes de A–D. Si había más de diez personas por grupo o una persona repetida entre grupos, se deben formar las guardias de nuevo. El calendario anterior se conserva íntegro en `legacyGuardData` dentro del respaldo y ya no controla la postguardia.

## Datos de las imágenes

- 18 médicos: 17 del rol semanal más Esquer, presente únicamente en MB-R y pendiente de horario manual.
- Combinaciones por médico, seis reglas R1 por servicio/turno y 14 residentes R1/R2 distintos disponibles inicialmente sin guardia.
- Los grupos de guardia se definen manualmente; la imagen de guardias ya no funciona como calendario mensual.
- Quiroz y Leyva conservan los días de actividad de residencia de la imagen. García M. y Beltrán F. quedan como coberturas para asignar manualmente.
- Los rangos de apoyo de días 1–16 y 19–30 se conservan. Las imágenes no indican su mes de vigencia.
- No hay rol fijo respaldado por las imágenes para sábados y domingos; esos días requieren actividades manuales.

Las observaciones de transcripción se conservan en los datos del proyecto. Las asignaciones iniciales proceden de las imágenes y pueden ajustarse antes de compartir.

## Compilar

El proyecto incluye configuración estándar de Android Studio, Android Gradle Plugin 9.2.1 y Gradle Wrapper 9.4.1. Abre la carpeta raíz, selecciona la configuración **app** y pulsa **Run** con un emulador o teléfono conectado. Se usa JDK 21 y Android SDK Platform 35.

Para generar el APK de pruebas desde PowerShell, con `JAVA_HOME` apuntando al JDK 21:

```powershell
.\gradlew.bat --offline :app:assembleDebug
```

La salida es **app/build/outputs/apk/debug/app-debug.apk**. La opción `--offline` utiliza las dependencias locales ya instaladas. Esta variante permite depurar la aplicación y su WebView.

Sólo si la ejecución desde la consola produce `Unable to establish loopback connection` / `UnixDomainSockets`, configura una carpeta temporal corta para ese proceso y repite el comando:

```powershell
$taskTemp = Join-Path $PWD 'build\tmp'
New-Item -ItemType Directory -Force -Path $taskTemp | Out-Null
$env:TEMP = $taskTemp
$env:TMP = $taskTemp
$env:JAVA_TOOL_OPTIONS = '-Djava.io.tmpdir="' + $taskTemp + '"'
.\gradlew.bat --offline :app:assembleDebug
```

El compilador manual también está disponible. Requiere Windows PowerShell, Build Tools 35.0.0 y JDK 21; usa el SDK instalado sin descargar dependencias:

```powershell
.\build-apk.ps1
.\build-apk.ps1 -Debug
```

Genera **dist/Rolero.apk** o, con `-Debug`, **dist/Rolero-debug.apk**. Se pueden proporcionar otras rutas:

```powershell
.\build-apk.ps1 -AndroidSdk 'C:\ruta\Android\Sdk' -JavaHome 'C:\ruta\jdk-21'
```

La compilación manual verifica la firma y la alineación del APK. Ambos métodos reutilizan **build/rolero-dev.jks** cuando existe: conserva esa clave para poder instalar actualizaciones sobre la versión anterior manteniendo los datos. La tarea `clean` de Gradle mantiene separados sus archivos generados y no elimina esa clave. No borres la clave al limpiar los archivos del compilador manual. Una distribución en tienda necesitará una clave de publicación y una gestión de versiones apropiadas.

## Verificación

```powershell
node --test tests/engine.test.cjs tests/postguard.test.cjs tests/guard-groups.test.cjs tests/mobile-relief.test.cjs tests/doctor-coverage.test.cjs tests/publication.test.cjs tests/resident-roster.test.cjs
node tests/ui.residents.smoke.cjs
node tests/android.smoke.cjs dist/Rolero-debug.apk
```

Las pruebas del motor cubren turnos, días, excepciones de las fuentes, vacaciones, fines de semana, orden Rotantes/R2/R1, salas, grupos, postguardia, sustituciones móviles, coberturas, respaldos y altas, asignaciones, promociones y bajas globales de residentes. También se pueden ejecutar con `node --test tests/*.test.cjs`.

La revisión actual de interfaz usa Playwright del entorno de desarrollo y Edge sin ventana. Comprueba la edición exclusiva en Guardias, los residentes existentes sin guardia, el nombre de la guardia, altas con médicos en ambos turnos, asignaciones múltiples con paneles cerrados, renombres, promociones, bajas confirmadas, rechazo de duplicados y límites sin perder datos, respaldos, persistencia y desbordes entre 360 y 1440 píxeles. El informe y las capturas se guardan en **qa/residents/**.

El script Android requiere un **APK debug**, un emulador conectado a ADB y el mismo Playwright. Sólo instala y modifica el emulador indicado mediante `ROLERO_DEVICE` (por defecto, **emulator-5554**); rechaza identificadores de teléfonos físicos y cierra las otras conexiones de Playwright. Añade `--installed` después de la ruta del APK para comprobar una instalación existente. La instalación normal se hace como actualización para conservar los datos. El script impide ejecutar órdenes externas de ADB mientras la WebView está conectada a Playwright.

La revisión nativa incluye cinco casos críticos: conservación de los datos y controles retirados, alta con médicos de ambos turnos y copia desde Crear, ascenso R1 a R2 con referencias conservadas, retiro confirmado al ascender a R3 y persistencia con cierre normal. Para esta última comprobación, verifica el almacenamiento, desconecta Playwright, vuelve a Inicio, espera dos segundos y después detiene y reabre el proceso. Guarda todas las entradas previas en **qa/residents/android-original-state.json** y las restaura al terminar, incluso si falla una prueba. El informe queda en **qa/residents/android-results.json**. Las capturas están desactivadas por defecto; se pueden habilitar con `ROLERO_SCREENSHOTS=1` y son diagnósticos opcionales.

En **1.3.0** pasaron **108 pruebas del motor**, **11 escenarios de interfaz en navegador** y **5 comprobaciones nativas en Android 15 (API 35)**. Los informes **qa/residents/ui-results.json** y **qa/residents/android-results.json** registran `success: true`, sin errores ni fallos de restauración. Las capturas de navegador fueron revisadas y el almacenamiento previo del emulador quedó restaurado íntegramente.

Los APK de entrega y depuración tienen sus firmas verificadas; las **10 comprobaciones de archivos empaquetados** coinciden con las fuentes actuales, según **qa/residents/package-checks.json**. **dist/Rolero-1.3.0.apk** es idéntico a **dist/Rolero.apk**.

Como referencia histórica, en **1.2.0** pasaron **85 pruebas del motor**, **12 escenarios de navegador** y **5 comprobaciones nativas en Android 15 (API 35)**, con los datos previos restaurados. Sus informes están en **qa/compact/** y su prueba de navegador, **tests/ui.compact.smoke.cjs**, corresponde al flujo anterior que incluía Texto del turno en Equipo. Los resultados de **qa/groups/** corresponden a 1.1.0 y los de **qa/android/** al flujo con calendario; ninguno acredita por sí solo la interfaz 1.3.0.

**Limitación pendiente:** en un intento de cierre forzado inmediato de 1.2.0 después de cambiar el recordatorio de Piso se perdió la última escritura de `floorR1Reminder`. El informe se conserva en **qa/compact/android-immediate-stop.json**. La comprobación de cierre normal no acredita la conservación de cambios ante una terminación inmediata del proceso.

No se ha probado en un teléfono físico ni en todas las versiones de Android admitidas. El APK de entrega desactiva la depuración del contenido; los APK debug la permiten para desarrollo.

## Archivos

- app/src/main/assets/: interfaz, datos y motor del rol.
- app/src/main/java/mx/rolero/app/MainActivity.java: integración Android para portapapeles, compartir y respaldo.
- app/src/main/AndroidManifest.xml: configuración Android, sin permiso de Internet.
- build-apk.ps1: compilación y firma reproducible usando el SDK local.

Los datos se guardan localmente. Para moverlos a otro teléfono, exporta un respaldo desde la aplicación y restáuralo en el nuevo dispositivo.
