# Rolero

Aplicación Android que prepara el texto del rol matutino y vespertino a partir de las tres imágenes del proyecto. Trabaja sin conexión y guarda los cambios en el teléfono.

El APK de entrega está en **dist/Rolero.apk** y su copia versionada en **dist/Rolero-1.6.0.apk**. La versión actual es **1.6.0** (código **7**), requiere Android 8 o posterior y utiliza la firma de desarrollo local. Para actualizar conservando los datos, instala el APK sobre la versión anterior con la misma firma.

## Uso

1. En **Crear**, elige fecha y turno. Los días laborables cargan el rol semanal fijo. **Organiza el turno** empieza cerrado; ábrelo para ajustar una actividad o la participación de un médico sólo para ese día. Sus residentes se muestran como referencia y se administran desde Guardias.
2. Revisa o edita la **Vista previa**. **Copiar texto** y **Compartir** están disponibles inmediatamente, incluso cuando todavía no has formado los grupos de guardia. Los médicos aparecen siempre en el texto. Compartir abre el selector de aplicaciones de Android.
3. Activa **Resto de R1 al terminar actividades** cuando necesites añadir a Piso la indicación exacta **(Resto de r1 al terminar actividades)**. El interruptor comienza apagado y conserva tu elección.
4. En **Equipo**, los paneles **Matutino** y **Vespertino** comienzan cerrados. Cada tarjeta muestra el tratamiento, apellido y residentes del médico; al abrirla puedes cambiar tratamiento, apellido y las actividades de lunes a viernes. La vista previa, la copia y el compartir están en Crear.
5. Usa **Añadir médico** dentro del turno correspondiente. El formulario toma ese turno y el nuevo médico comienza sin residentes asignados. **Quitar del equipo** solicita confirmar la eliminación. Se pueden quitar todos los médicos y volver a añadirlos después.
6. Abre **Vacaciones y ausencias** en Equipo. Para un médico, selecciona quién se ausenta y, si corresponde, quién lo cubre; ambas listas reúnen a los médicos de los dos turnos. Añade fecha inicial, fecha final y una nota. La cobertura muestra el nombre del sustituto con la actividad y los residentes del médico ausente. El sustituto conserva también su actividad propia y sus residentes.
7. Para una ausencia de residente, cambia a **Residente**, elige apellido y grado e indica el rango de fechas. Se retira de todas sus asignaciones durante ese periodo, en ambos turnos; vuelve a aparecer fuera de esas fechas.
8. En **Guardias**, elige la **Guardia actual**, la **Fecha de esta guardia** y el número de grupos, de **3 a 6**. La guardia y la fecha quedan como referencia para calcular el ciclo de los demás días. La aplicación nueva empieza con cuatro guardias vacías, A–D. Abre una guardia para cambiar el **Nombre de la guardia** o administrar sus integrantes. Admite hasta **10 integrantes, sólo R1 y R2**, y cada persona pertenece a una sola guardia.
9. Usa **Añadir integrante** para elegir un residente existente sin guardia o crear uno nuevo con nombre y grado. Agregar uno existente conserva sus asignaciones. Los R1 y R2 de los datos iniciales también están disponibles en **Residentes sin guardia**.
10. Abre la tarjeta de un residente para cambiar su nombre, grado o guardia. En **Médicos por turno**, abre Matutino o Vespertino y marca los médicos que correspondan; puedes elegir varios en cada turno y asignar a la misma persona en ambos. **Guardar residente** conserva las selecciones aunque los paneles estén cerrados.
11. **Ascender a R2** actualiza el grado del R1 en todas sus asignaciones activas, ausencias y sustituciones móviles. **Ascender a R3** solicita confirmar y retira a esa persona de los turnos, apoyos, ajustes diarios, guardias, ausencias y sustituciones activas. **Quitar residente** también solicita confirmar una baja global. Los textos históricos y datos antiguos de respaldo se conservan.
12. El botón superior de respaldo permite exportar e importar toda la configuración en JSON.

**Rol de R1:** en Equipo, debajo de Vacaciones y ausencias, el panel **Rol de R1** muestra todos los R1 registrados. Abre un residente y el turno Matutino o Vespertino. Elige **Piso**, **Consulta externa**, **Quirófano**, **Urgencias** o **Médico de base**; esta última opción abre la lista de médicos de ese turno. Pulsa **Guardar rol**. Cada R1 tiene un destino por turno. Los servicios lo colocan con un médico disponible y Piso se muestra de forma independiente. Los residentes disponibles que quedan sin destino pasan a Piso; las ausencias, la postguardia y la reserva de los móviles se respetan. **Conservar rol actual** recupera las asignaciones heredadas. La selección de Equipo tiene prioridad sobre la combinación anterior del R1. Los R2 mantienen su configuración en Guardias.

**Salas de quirófano:** debajo de Organiza el turno está el panel **Salas de quirófano**, con **QX 1 a QX 6**. Abre una sala, selecciona un médico y pulsa **Asignar a QX**. Puedes añadir varios médicos a la misma sala: cada uno conserva su línea y sus R2/R1, en el orden en que fue incorporado. Las salas siguen ordenadas numéricamente. Mover a un médico lo añade al final de su nueva sala; asignarlo de nuevo a la misma sala conserva su posición. **Restablecer actividad** recupera la actividad, sala y orden anteriores. Los cambios corresponden sólo a la fecha y turno elegidos. Los médicos ausentes sin cobertura o excluidos no se ofrecen en la lista. Si hay una cobertura, el selector identifica al sustituto y al médico que cubre. Las salas anteriores sin orden registrado conservan su orden de equipo.

El texto sigue el ejemplo del usuario: «Rol TM» / «Rol TV», bloques Quirófano, Consulta, Urg y Piso; barras entre integrantes. Una sala puede repetirse en varias líneas, por ejemplo **QX 1 Dr. López / Rotantes / Pérez R2** y después **QX 1 Dra. Ruiz / Rotantes / García R1**. Los R3/R4 predefinidos se agrupan como **Rotantes**, seguidos de los R2 y los R1 de cada equipo. Los R1 de servicios se incorporan al equipo correspondiente en vez de un pie de Apoyo. El ascenso de un R2 administrado desde Guardias lo retira del conjunto activo; no crea un Rotante nuevo. La vista previa no incorpora una leyenda de postguardia. No se envían mensajes automáticamente.

**Médicos de QX sin sala:** un médico con actividad de quirófano necesita una sala QX 1–6 para aparecer en el rol. Si no la tiene, se omite únicamente de ese reporte; su horario fijo y sus ajustes no se marcan como excluidos. Sigue en el selector para asignarle sala. Sus R2 disponibles pasan primero a otra sala, después a Consulta, luego a Urgencias y finalmente a Piso. No se duplican si ya están en otro equipo. Los R1 de una sala compartida permanecen en ella al mover o retirar a uno de sus médicos; si allí ya no queda un equipo, pasan a Piso. La referencia de sala de esos R1 se guarda por fecha y turno, también en los respaldos.

**Guardias por fecha:** el ciclo avanza un grupo por día desde la guardia y fecha de referencia, incluidos sábados, domingos y cambios de mes. También se puede consultar una fecha anterior. Por ejemplo, si el 26 corresponde a A, el 27 corresponde a B y el 28 a C. Cambiar la fecha en Crear consulta ese día y no modifica la referencia guardada en Guardias.

**Postguardia por ciclo:** el grupo anterior al que corresponde a la fecha del rol queda de postguardia. Con cuatro grupos, A toma D y D toma C; con tres, A toma C; con seis, A toma F. Sus R1 y R2 se excluyen de las combinaciones y apoyos de ambos turnos. Los móviles también usan la postguardia calculada para esa fecha. El resumen de Crear muestra la guardia y postguardia del día consultado; el texto para copiar conserva sólo el rol.

**Residentes y móviles:** Guardias permite editar residentes, grados y combinaciones anteriores; Equipo configura el rol por turno de los R1. El cambio de nombre actualiza también sus destinos guardados. Al ascender un R1 con médico explícito a R2 se conserva ese médico, salvo una nueva asignación elegida al ascender. Los emparejamientos móviles mantienen su funcionamiento: sustituyen al fijo ausente o de postguardia y quedan en reserva si está disponible. El relevo de un R1 configurado sigue su nuevo destino. Un móvil ausente o de postguardia no cubre. El retiro confirmado elimina sus sustituciones y su rol de R1; los textos históricos permanecen intactos.

**Datos conservados:** los apoyos R1 por servicio, las notas anteriores de Piso y el historial siguen formando parte de los datos y respaldos, aunque no tienen editor propio. Los R3 y R4 predefinidos conservan su médico y se presentan como Rotantes.

**Respaldos y actualización:** el formato sigue siendo **esquema 3**. Se guardan la fecha de referencia de la guardia, las salas por fecha y turno y la actividad anterior que permite restablecerlas. Los respaldos de esquemas 1 y 2 se migran conservando médicos, roles, combinaciones, ajustes diarios, ausencias, apoyos, notas, historial y los móviles existentes. Si falta una fecha de referencia, la primera apertura toma el día actual y conserva la guardia seleccionada; revisa esa referencia en Guardias si corresponde a otro día. Se mantienen los médicos visibles, la postguardia automática y el texto sin bloque de guardia ni fecha añadida. El recordatorio de Piso comienza apagado al migrar una versión que no lo tenía.

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
node --test tests/engine.test.cjs tests/postguard.test.cjs tests/guard-groups.test.cjs tests/mobile-relief.test.cjs tests/doctor-coverage.test.cjs tests/publication.test.cjs tests/resident-roster.test.cjs tests/duty-cycle.test.cjs tests/operating-rooms.test.cjs
node --test tests/r1-priorities.test.cjs
node --test tests/redistribution.test.cjs
node tests/ui.redistribution.smoke.cjs
node tests/android.smoke.cjs dist/Rolero-debug.apk
```

Las pruebas del motor cubren turnos, días, excepciones de las fuentes, vacaciones, fines de semana, orden Rotantes/R2/R1, grupos, ciclo por fecha, postguardia, sustituciones móviles, coberturas, respaldos, residentes y salas QX con agrupación, movimiento y restablecimiento de actividad. También se pueden ejecutar con `node --test tests/*.test.cjs`.

La revisión actual de interfaz usa Playwright del entorno de desarrollo y Edge sin ventana. Comprueba líneas QX separadas, orden de incorporación, destino R1 incluyendo Urgencias, Piso independiente, exclusión temporal de médicos sin sala, redistribución de R2 y permanencia de R1 en sala compartida, coberturas, relevos, respaldo, recarga y desbordes entre 360 y 1440 píxeles. Los escenarios usan fechas explícitas y conservan el almacenamiento previo. El informe y las capturas se guardan en **qa/redistribution/**. Las regresiones que presuponen quirófanos programados preparan salas en una copia del caso con **tests/planned-role.cjs**; las pruebas de redistribución usan el generador directamente, incluyendo médicos sin sala.

El script Android requiere un **APK debug**, un emulador conectado a ADB y el mismo Playwright. Sólo instala y modifica el emulador indicado mediante `ROLERO_DEVICE` (por defecto, **emulator-5554**); rechaza identificadores de teléfonos físicos y cierra las otras conexiones de Playwright. Añade `--installed` después de la ruta del APK para comprobar una instalación existente. La instalación normal se hace como actualización para conservar los datos. El script impide ejecutar órdenes externas de ADB mientras la WebView está conectada a Playwright.

La revisión nativa ejecuta los cinco flujos de usuario compartidos con el navegador y añade una sexta comprobación de cierre normal: verifica el almacenamiento, desconecta Playwright, vuelve a Inicio, espera dos segundos y después detiene y reabre el proceso. Las solicitudes de copia llegan al portapapeles nativo real. Guarda todas las entradas previas en **qa/redistribution/android-original-state.json** y las restaura al terminar, incluso si falla una prueba. El informe queda en **qa/redistribution/android-results.json**. No captura pantallas ni ejecuta órdenes externas de ADB mientras la WebView está conectada.

En **1.6.0** pasaron **160 pruebas del motor**, **6 escenarios de navegador** y **6 comprobaciones en el emulador Android 15/API 35**: **172 comprobaciones aprobadas**. Los informes actuales de **qa/redistribution/** registran `success: true`, sin errores ni fallos de restauración; el almacenamiento previo del emulador quedó restaurado íntegramente. Las capturas de navegador fueron revisadas. **unit-results.tap** contiene la salida completa del motor y **package-checks.json** confirma diez recursos empaquetados idénticos a las fuentes. Los APK de entrega y depuración tienen firmas v2/v3 verificadas. **dist/Rolero-1.6.0.apk** es idéntico a **dist/Rolero.apk**, versión 1.6.0/código 7. Las capturas nativas están desactivadas.

Como referencia histórica, en **1.5.0** pasaron **148 pruebas del motor**, **5 escenarios de navegador** y **5 comprobaciones en el emulador Android 15/API 35**: **158 comprobaciones aprobadas**. Sus informes, capturas y comprobaciones de recursos se conservan en **qa/priorities/**; sus escenarios de interfaz están en **tests/ui.priorities.smoke.cjs**.

Como referencia histórica, en **1.4.0** pasaron **138 pruebas del motor**, **10 escenarios de interfaz en navegador** y **5 comprobaciones nativas en Android 15 (API 35)**: **153 comprobaciones aprobadas** en total. Sus informes se conservan en **qa/rooms/** y su navegador en **tests/ui.rooms.smoke.cjs**. Ese flujo reunía a los médicos de una sala en una sola línea.

Los APK de entrega y depuración tienen firmas **v2 y v3** verificadas y metadatos **1.4.0 / código 5**. Las **10 comprobaciones de archivos empaquetados** coinciden con las fuentes actuales, según **qa/rooms/package-checks.json**. **dist/Rolero-1.4.0.apk** es idéntico a **dist/Rolero.apk**.

Como referencia histórica, en **1.3.0** pasaron **108 pruebas del motor**, **11 escenarios de navegador** y **5 comprobaciones nativas en Android 15 (API 35)**, con restauración íntegra del estado previo. Sus informes y las diez comprobaciones de archivos empaquetados están en **qa/residents/**. **tests/ui.residents.smoke.cjs** corresponde a ese flujo, cuya guardia todavía no avanzaba con la fecha.

Como referencia histórica, en **1.2.0** pasaron **85 pruebas del motor**, **12 escenarios de navegador** y **5 comprobaciones nativas en Android 15 (API 35)**, con los datos previos restaurados. Sus informes están en **qa/compact/** y su prueba de navegador, **tests/ui.compact.smoke.cjs**, corresponde al flujo anterior que incluía Texto del turno en Equipo. Los resultados de **qa/groups/** corresponden a 1.1.0 y los de **qa/android/** al flujo con calendario; ninguno acredita por sí solo la interfaz 1.3.0.

**Limitación pendiente:** en un intento de cierre forzado inmediato de 1.2.0 después de cambiar el recordatorio de Piso se perdió la última escritura de `floorR1Reminder`. El informe se conserva en **qa/compact/android-immediate-stop.json**. La comprobación de cierre normal no acredita la conservación de cambios ante una terminación inmediata del proceso.

No se ha probado en un teléfono físico ni en todas las versiones de Android admitidas. El APK de entrega desactiva la depuración del contenido; los APK debug la permiten para desarrollo.

## Archivos

- app/src/main/assets/: interfaz, datos y motor del rol.
- app/src/main/java/mx/rolero/app/MainActivity.java: integración Android para portapapeles, compartir y respaldo.
- app/src/main/AndroidManifest.xml: configuración Android, sin permiso de Internet.
- build-apk.ps1: compilación y firma reproducible usando el SDK local.

Los datos se guardan localmente. Para moverlos a otro teléfono, exporta un respaldo desde la aplicación y restáuralo en el nuevo dispositivo.
