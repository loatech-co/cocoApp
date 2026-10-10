# Plan de trabajo completo: app de gastos (web + API + iOS)

Fecha de esta versión: 2026-10-04, con los añadidos del dueño del 5 de octubre. Basado en la auditoría técnica del repositorio de esa fecha; lo que sigue vigente de ella quedó escrito en este plan y en `docs/standards/audit.md`.

## Cómo usar este documento

El documento tiene tres partes, en el orden en que se ejecutan:

1. **Verificación de las fases 0 a 5.** Las fases ya se implementaron en modo autónomo. Antes de seguir, Code verifica punto por punto que cada una quedó **tal cual se pidió**, con evidencia, y cierra las brechas que encuentre. La especificación original de cada fase está en el anexo, al final, y es la referencia contra la que se verifica.
2. **Fase 6: deuda técnica.** Se ejecuta solo cuando la verificación esté cerrada.
3. **Fase 7: mejoras globales** (estándares y mantenibilidad). Al final de todo.

## Antes de empezar: consumo de tokens

El consumo de tokens de las fases anteriores fue muy alto, incluso con el modelo y la configuración actuales. Antes de la verificación, Code hace un diagnóstico y aplica las correcciones, porque el objetivo es **terminar todo el plan sin quedarse sin presupuesto y sin perder ni una pizca de calidad**.

**Diagnóstico (primero, y en el informe):**

- Mide el consumo con las herramientas de costo y contexto que tengas disponibles en Claude Code, y revisa el registro de la sesión para identificar **qué operaciones concretas consumen más**: lecturas de archivos grandes completos (por ejemplo, el modal de ~1.800 líneas o los documentos de auditoría), relectura de los mismos archivos en varios agentes, salidas largas de herramientas (pruebas, builds, `git diff` de archivos grandes, instalación de dependencias), agentes paralelos que cargan cada uno el contexto entero, el volumen de lo que Engram sincroniza en cada turno, y el tamaño de las instrucciones y skills que se cargan al inicio.
- Entrega una tabla corta: operación, consumo estimado, causa, corrección aplicada.

**Reglas de ahorro que se aplican desde ahora** (ninguna reduce la verificación, las pruebas ni la calidad; solo eliminan lectura y salida redundantes):

- Antes de leer un archivo, buscar (`grep`, `rg`) y leer solo el rango necesario. Un archivo grande completo se lee una sola vez por tarea, y lo que se necesite de él se anota en una nota corta en vez de releerlo.
- Salidas de herramientas acotadas: reporteros de pruebas en modo silencioso con resumen final, `tail` sobre logs y builds, `git diff --stat` antes de cualquier diff completo, y nunca volcar `node_modules`, `dist`, archivos generados ni lockfiles.
- Las pruebas se ejecutan de forma dirigida mientras se trabaja (solo las afectadas) y **la suite completa una vez antes de cada pull request**. Eso no es menos verificación: es la misma verificación sin repetirla veinte veces.
- Un agente por tarea, con un encargo acotado y un entregable corto. Nada de varios agentes leyendo el mismo repo en paralelo para una misma decisión.
- Lo que va a Engram se escribe condensado: decisiones y estado, no transcripciones ni salidas de comandos.
- Ante una duda que se puede resolver con una lectura puntual, se hace la lectura puntual, no una exploración del repo completo.

**Lo que no se toca para ahorrar:** la cantidad de pruebas, el typecheck y el lint antes de integrar, las verificaciones de despliegue, el registro de decisiones y los informes. Si en algún momento hay que elegir entre ahorrar tokens y verificar algo, se verifica.

## Modo de ejecución

Code trabaja en **modo autónomo**: no pide intervención: las paradas y lo que exige un borrado están en la tabla única de [`CLAUDE.md`](../CLAUDE.md), y cualquier otra mención de paradas en este documento queda sin efecto. Si queda esperando a un agente o a un proceso, revisa el estado por su cuenta cada pocos minutos y retoma apenas termine, sin esperar a que le escriban. Al final de cada parte entrega un informe que se valida contra este documento.

## Reglas generales

1. Cada parte empieza cuando la anterior está terminada y desplegada.
2. Una rama propia por fase o por paso, creada desde la rama de integración actualizada.
3. Migraciones solo aditivas, salvo el procedimiento de expandir y contraer de la fase 7. Orden siempre: migración, verificación, merge, push, verificación del despliegue. Nunca código antes que esquema.
4. Terminado significa: typecheck, lint y pruebas pasan en todos los workspaces.
5. Nada fuera de lo que piden las fases. Lo que convenga mejorar y no esté en el plan va a pendientes del informe, no al código. Ninguna dependencia nueva ni decisión fuera del plan sin anotarla con su motivo en el registro (`docs/registro-autonomo.md`).

## Añadidos del dueño (5 oct 2026)

| Bloque | Qué                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Dónde aplica                                                                                                                                                                                    |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A      | Lectura de documentos en iOS. **No es parada.** En la fase 7 `packages/lectura` solo se ordena (renombre, estructura, pruebas) sin cambiar dónde ni cómo se interpreta un documento. Cómo comparte iOS esa lógica queda como **decisión pendiente** para cuando se retome iOS.                                                                                                                                                                                                                                       | 7.2 / 7.4 (orden); decisión pendiente para iOS                                                                                                                                                  |
| B      | ADR de monolito modular; un módulo solo habla con otro a través de su servicio público.                                                                                                                                                                                                                                                                                                                                                                                                                              | 7.4                                                                                                                                                                                             |
| C      | Ciclo de vida de los documentos: cuáles se crean, cuáles se destilan en ADR o runbook y cuándo se borran.                                                                                                                                                                                                                                                                                                                                                                                                            | 7.12 y 7.14                                                                                                                                                                                     |
| D      | Limpieza inmediata: en la carpeta del proyecto solo vive el proyecto. La data real y los respaldos salen a `$COCO_DATA_DIR`. **No es parada:** ningún respaldo se borra en la fase 7; la política de retención va al runbook como propuesta.                                                                                                                                                                                                                                                                         | Ya, antes de seguir                                                                                                                                                                             |
| E      | Formato de las reglas: la regla arriba, el porqué debajo.                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `CLAUDE.md`, `CONTRIBUTING.md`, ADR                                                                                                                                                             |
| F      | Modo de trabajo: director + un ejecutor por paso (`/paso <id>`), traspasos cortos en `.claude/traspasos/`.                                                                                                                                                                                                                                                                                                                                                                                                           | Todos los pasos desde ahora                                                                                                                                                                     |
| G      | Línea de estado de Claude Code con el tamaño del contexto, para ver cuándo se salta el modelo de F.                                                                                                                                                                                                                                                                                                                                                                                                                  | Configuración local, ya                                                                                                                                                                         |
| H      | Frontend: diseño atómico en `shared/ui` vigilado por `dependency-cruiser`; reubicación por dominio (`app` → `features` → `shared`); regla rígido en las piezas, flexible en la composición; división de los archivos gigantes (`movimiento-modal`, `soportes`); Storybook.                                                                                                                                                                                                                                           | 7.4-web-a (estructura), web-b, web-c, web-d                                                                                                                                                     |
| I      | Revisión externa del 5 oct 2026 (`$COCO_DATA_DIR/auditorias/reto-del-plan-2026-10-05.md`, fuera del repo), en cuatro partes: **I.1 Cambiar ya** (doce hallazgos: clasificación, medición, respaldos, cuota de Actions, compuerta, paradas, iOS, alcance de la fase 7, contexto de los agentes, producción sin vigilancia, local primero, firma de iOS); **I.2 Puede esperar**; **I.3 El código frente a la práctica de 2026** (arquitectura, frontend, seguridad, API y base, calidad, iOS); **I.4 Orden sugerido**. | I.1 e I.3: pasos R —R-1a #46, R-1b-web #44, R-1b-api #47, R-1c #48, R-2-v2, R-3 #49, R-ctx (paradas y contexto)— y Prisma 7 adelantado (#35). I.2: fase 8 (8.3). I.4: el orden de la cola de PR |

**Paradas y borrados: la tabla única de [`CLAUDE.md`](../CLAUDE.md).** Ninguna otra versión vale, tampoco las de este documento.

---

# Parte 1: verificación de las fases 0 a 5

**Método.** Para cada punto de las listas siguientes, Code anota en `docs/verificacion-fases-0-5.md`: **Cumple**, **Parcial** o **No cumple**, y la evidencia (archivo y línea, salida de un comando, consulta a la base, comprobación contra producción). La referencia es la especificación del anexo, no el recuerdo de lo que se hizo. Todo lo **Parcial** o **No cumple** se corrige antes de la fase 6, con las mismas reglas de siempre (rama, pruebas, migración antes que código, despliegue verificado), y se vuelve a verificar. La verificación termina cuando todos los puntos están en **Cumple** o tienen un motivo aceptado para no cumplirse, anotado en el registro.

## Fase 0: base segura

- [ ] `api/.env` apunta al Postgres local; producción solo en archivos explícitos (`api/.env.supabase`).
- [ ] La API se niega a arrancar si `NODE_ENV` no es `production` y la base no está en la lista de equipos locales. La válvula `PERMITIR_BASE_REMOTA` está documentada y no aparece en ningún archivo versionado.
- [ ] `SOPORTES_DIR` local apunta a una carpeta local.
- [ ] Login local sin escribir datos de aplicación en producción; las cuatro operaciones destructivas de autenticación (cerrar todas las sesiones, cambiar contraseña, crear usuario, eliminar usuario) se niegan fuera de producción.
- [ ] La base local se siembra con un script idempotente: usuario, plantilla, conceptos recurrentes y "Mercado" con presupuesto.
- [ ] `frontend/eslint.config.js` existe, `npm run lint` corre en los cuatro workspaces y termina en 0 errores.
- [ ] Los 8 errores de lint de `supabase-auth.service.ts` están corregidos.
- [ ] `api/.env.example` lista todas las variables obligatorias, solo nombres y descripción.
- [ ] Verificado en el servidor que producción corre con `NODE_ENV=production`, y documentada la rama que Hostinger despliega.

## Fase 1: conceptos que se pagan en varias veces

- [ ] Columna `categories.varios_pagos BOOLEAN NOT NULL DEFAULT false`, con migración aplicada en producción **antes** del código, y el campo en `packages/types`.
- [ ] DTO: la marca solo se acepta en conceptos (nivel 3) recurrentes; con `pago_automatico = true` responde 422 con mensaje claro.
- [ ] Pendientes: con la marca, el concepto sigue mientras lo pagado `cleared` sea menor que lo esperado; la respuesta incluye lo pagado; sale al alcanzar lo esperado; sin valor esperado mayor que 0 se comporta como antes; sin la marca, nada cambió.
- [ ] Los conceptos archivados quedan fuera de pendientes y **siguen** en los agregados históricos.
- [ ] El indicador "Presupuesto necesario" cuenta el mayor entre lo pagado y lo esperado solo para conceptos con la marca.
- [ ] Interfaz: interruptor "Se paga en varias veces" visible solo en recurrentes, deshabilitado con explicación cuando hay pago automático (y viceversa); la tarjeta muestra el avance y "Registrar otro" abre la ficha con concepto y fecha precargados y el valor vacío.
- [ ] Existen las pruebas de la lista de la especificación (pendientes, indicador, DTO, frontend) y pasan.
- [ ] Verificado en producción con el código viejo y con el nuevo, según el procedimiento acordado.

## Paso intermedio: react-hooks

- [ ] Los 26 errores de `react-hooks/set-state-in-effect` y `react-hooks/refs` quedaron en 0, sin desactivar ni rebajar reglas.
- [ ] Las únicas excepciones son las dos de URLs `blob:`, cada una con su motivo escrito encima.
- [ ] Ningún cambio de comportamiento visible salvo la desaparición del fotograma intermedio, documentada.
- [ ] El hook compartido tiene sus pruebas; la prueba frágil corregida pasa aislada.

## Fase 2: registro rápido

- [ ] Un solo buscador sobre todo el árbol: busca en nombres de conceptos y categorías y en `palabras_clave`, ignora tildes y mayúsculas, muestra la ruta de cada resultado.
- [ ] Elegir un concepto completa categoría y centro con `rutaSeleccionada()`; elegir una categoría completa el centro y deja el concepto vacío.
- [ ] Con el buscador vacío aparecen hasta 5 conceptos recientes del usuario.
- [ ] "Crear concepto" pide solo la categoría.
- [ ] La cascada sigue disponible como opción secundaria; el comportamiento de los centros `estatico` se conservó.
- [ ] **No** se agregó búsqueda en el servidor ni las extensiones `unaccent` o `pg_trgm`.
- [ ] La ficha llama a `/categorization/suggest` con descripción o comercio, con espera entre teclas; la sugerencia aparece marcada y editable.
- [ ] Precedencia implementada y probada: elección manual, historial, palabras clave del usuario, diccionario del sistema; una fuente inferior nunca reemplaza a una superior.
- [ ] Al guardar, aceptar o corregir una sugerencia crea o actualiza la regla en `category_rules`; una descripción vacía no crea reglas; nada se guarda clasificado sin que el usuario lo vea.
- [ ] Diccionario del sistema en `packages/lectura`, con términos genéricos (no categorías ni conceptos), tres niveles de certeza (alta, media, ninguna) con el comportamiento especificado, y el diccionario completo incluido en el informe.
- [ ] Medido: un gasto con clasificación completa en cinco interacciones o menos, y en cuatro cuando la sugerencia acierta.

## Fase 3: un solo cerebro en la API

- [ ] La API importa `packages/lectura` tal cual; no hay copia ni versión movida del motor. El paquete quedó puro.
- [ ] Columnas en `transactions`: `source` (enum `web`, `ios_manual`, `ios_photo`, `wallet`, `sms`, obligatoria, `web` por defecto), `raw_text`, `captured_at`, `por_revisar` (`false` por defecto). Migración aditiva aplicada en producción antes del código; contrato actualizado.
- [ ] Idempotencia por `external_ref`: el mismo valor repetido devuelve el gasto ya creado con 200, nunca un duplicado ni un error.
- [ ] `POST /transactions/interpret` no escribe nada y devuelve monto, fecha, comercio o descripción, clasificación propuesta con certeza y si necesita revisión.
- [ ] `POST /transactions/capture` interpreta, clasifica, detecta duplicados y crea en una sola petición; devuelve el gasto, la clasificación y el resumen corto para notificación. Certeza alta clasifica; media o ninguna no adivina y marca `por_revisar`.
- [ ] Duplicados Wallet + SMS: mismo monto, misma fecha, origen distinto, dentro de la ventana definida → **enriquece** el existente y responde que fusionó; parecido parcial → crea con `por_revisar`; orígenes iguales no fusionan. Nunca borra.
- [ ] La web usa `/transactions/interpret` para rellenar la ficha y envía `source = web` y `raw_text` cuando viene de un recibo; sigue registrando igual que antes.
- [ ] Existen y pasan las pruebas de idempotencia, certeza, duplicados y de que `interpret` no escribe.

## Fase 4: API lista para iOS

- [ ] `login` y `refresh` aceptan una indicación explícita de cliente nativo; para nativos el refresh token viaja en el cuerpo (respuesta y petición) y rota en cada renovación; para la web nada cambió.
- [ ] `logout` funciona con el token en el cuerpo; la revocación por `sessions_valid_from` aplica a los dos tipos de cliente; los throttles se mantienen.
- [ ] Verificado en local y contra producción que la web sigue iniciando sesión con la cookie.
- [ ] Proyecto de Supabase de desarrollo creado con la CLI y conectado al entorno local; si no fue posible, el error exacto está documentado y el entorno local sigue sin tocar la autenticación de producción en lo que depende de la API.
- [ ] Contrato del endpoint de soportes documentado para el cliente (tipos, límite por archivo, tamaño recomendado).
- [ ] Primera prueba e2e: login, refresh con rotación, logout y revocación para cliente nativo contra la base local; estructura lista para más e2e.

## Fase 5: app iOS híbrida

- [ ] Proyecto de Xcode sin dependencias externas no justificadas; firma con equipo personal; `README` con instalación y renovación cada 7 días.
- [ ] Sesión: login nativo, refresh token en el Keychain, access token en memoria, renovación silenciosa también desde las acciones en segundo plano.
- [ ] Cola de capturas: se guarda primero en el teléfono con `external_ref` UUID; envío a `/transactions/capture`; reintentos con espera creciente; contador de pendientes; con foto, primero el texto y luego la foto como soporte.
- [ ] Tres acciones de la app expuestas como App Shortcuts: Wallet (comercio, monto, tarjeta, nombre; sin monto captura con `por_revisar`; corre en segundo plano), SMS (texto y remitente; segundo plano) y manual (abre el formulario).
- [ ] Formulario rápido: monto, concepto con buscador (nombre y palabra clave, ruta, completa categoría y centro, árbol de `/categories` guardado en el teléfono), nota y cámara con OCR de Vision y relleno desde `/transactions/interpret`.
- [ ] Accesos rápidos: control de Centro de Control y pantalla bloqueada en iOS 18 o superior; widget y botón de acción en iOS 17.
- [ ] Notificaciones locales: resultado de cada captura, envío de la cola y aviso un día antes del vencimiento del certificado leído del perfil incluido.
- [ ] Pantalla de bienvenida con los pasos de las dos automatizaciones y botón que abre Atajos.
- [ ] Híbrido: todo lo no nativo se carga en `WKWebView` con una sola sesión (sin segundo login, sin tokens en la URL), navegación nativa que mezcla pantallas y vistas web, renovación de sesión del webview, estado claro sin conexión. Los ajustes del frontend para modo embebido no afectan a la web normal.
- [ ] Compila y sus pruebas pasan en el simulador; existen pruebas de la cola, de los parámetros de las acciones y del aviso de vencimiento.
- [ ] La instalación en el iPhone quedó como último punto del informe, con la lista de verificación manual.

## Cumplimiento del modo autónomo

- [ ] `docs/registro-autonomo.md` existe y registra cada decisión fuera del plan con su motivo.
- [ ] Todas las migraciones fueron aditivas y se aplicaron antes del código, con verificación entre ambas.
- [ ] Cada integración fue fast-forward o squash sin reescribir historia; ningún force-push salvo una vuelta atrás documentada.
- [ ] Cada despliegue tiene su verificación por SSH y contra el sitio en producción.
- [ ] No se añadieron dependencias sin motivo registrado; no hubo refactors fuera del alcance de la fase en curso.

**Cierre de la Parte 1:** informe con la tabla de verificación completa, las brechas encontradas y cómo se cerraron, y la tabla de consumo de tokens con las correcciones aplicadas. **Detente y entrégalo** antes de empezar la fase 6.

---

# Parte 2: deuda técnica

## Fase 6: resolución de la deuda técnica

**Cuándo:** después de la fase 5 (app iOS instalada e informe validado) y antes de la fase 7 (estándares).

**Objetivo:** cerrar la deuda que dejó la auditoría inicial. Ninguna de estas tareas cambia lo que el usuario ve, salvo donde se indica.

### Reglas

- Siguen vigentes el modo autónomo; paradas y borrados, en la tabla de [`CLAUDE.md`](../CLAUDE.md).
- Migraciones solo aditivas, como hasta ahora. Nada se borra en esta fase: los borrados quedan para el paso de contracción de la fase 7.
- Sin servicios externos que exijan crear cuentas. Si una tarea solo se puede resolver así, documéntala como propuesta en el informe y resuelve el resto.
- Un paso por rama, pull request y despliegue, en el orden de abajo (de menor a mayor riesgo). Nunca dos pasos en un mismo despliegue.
- Cada paso con sus pruebas. Typecheck, lint y pruebas en verde antes de integrar.

---

### 6.1 Instalación de dependencias en el servidor

El `npm install` del despliegue falla en el primer intento por un desajuste de versiones (`esbuild` dentro de `tsx`) y Hostinger lo recupera con `--legacy-peer-deps`. Corrige las versiones para que la instalación pase limpia al primer intento. Verifica en el siguiente despliegue leyendo el registro del servidor.

### 6.2 Periodicidades intermedias

`bimestral`, `trimestral` y `semestral` nunca se han usado y no tienen pruebas. Escribe pruebas unitarias de `tocaEnElMes()` y del cálculo de vencimiento para las tres, incluyendo meses cortos y el caso sin `mes_de_pago`. Si alguna falla, corrige la lógica y anótalo.

### 6.3 Coherencia de la recurrencia en la base

Agrega restricciones CHECK con migración en SQL (Prisma no las genera): un concepto `recurrente` debe tener `periodicidad`; `mes_de_pago` solo si la periodicidad no es mensual; `dia_de_pago` entre 1 y 31; `mes_de_pago` entre 1 y 12; `varios_pagos` y `pago_automatico` no pueden ser ambos verdaderos; `varios_pagos` solo con `recurrente`. Antes de aplicar, verifica por consulta que ninguna fila existente las viola (la auditoría encontró cero casos; confírmalo). La API debe devolver 422 con mensaje claro si una restricción rechaza un cambio.

### 6.4 Columna de moneda

Agrega `transactions.currency`, `CHAR(3) NOT NULL DEFAULT 'COP'`. El formateo de dinero pasa a usar esa columna en lugar del valor fijo. Ningún cambio visible: todo sigue en COP.

### 6.5 Aislamiento entre usuarios

El aislamiento depende de que cada consulta de Prisma lleve `user_id`. Escribe una prueba automática que lo verifique en todos los repositorios: para cada método que lee o escribe datos de usuario, dos usuarios de prueba y la comprobación de que ninguno alcanza los datos del otro. Corre contra la base local. Si encuentra un hueco, corrígelo y anótalo como incidente. Las políticas RLS reales se evalúan en la fase 7.

### 6.6 Módulo `imports`

Siete endpoints vivos sin pantalla. Retira los endpoints y el código que solo ellos usaban. Conserva lo que otros módulos reutilizan (por ejemplo, la lógica de huellas si la usa la fase 3) y conserva las tablas `import_batches` e `import_rows` con sus datos: su borrado va en la fase 7.

### 6.7 Cobro automático fuera del `GET`

Hoy `/dashboard` escribe movimientos durante un `GET`. Pásalo a una tarea programada **dentro del mismo proceso** (la API es un solo proceso Node de larga vida, así que no hace falta cron del hosting ni acceso al panel). Corre una vez al día y al arrancar. El `GET` deja de escribir. La idempotencia por `external_ref` se mantiene. Prueba: la tarea con dos ejecuciones seguidas crea cada movimiento una sola vez.

### 6.8 Logs y operación

- Logs estructurados (JSON) con identificador de petición en cada línea, para poder seguir una petición completa.
- Los logs se escriben fuera de la carpeta de la versión desplegada, con rotación, para que no se pierdan en cada despliegue. Verifica que la cuenta de procesos y de disco del hosting lo permiten.
- El health check queda público y responde sin autenticación.
- Un servicio externo de errores queda como propuesta en el informe, no se implementa aquí.

### 6.9 Soportes a Supabase Storage

Los soportes viven en el disco del hosting: sin respaldo automático, sin CDN, con binarios huérfanos al borrar movimientos, y ya hubo una desincronización entre entornos. Supabase Storage en el plan gratuito alcanza de sobra (hoy son ~31 MB).

1. **Respaldo** completo de los archivos actuales con el script existente antes de tocar nada.
2. **Adaptador nuevo** detrás de la misma interfaz de `soportes.almacen.ts` (`guardar`, `abrir`, `existe`, `claveNueva`), con bucket privado y acceso solo desde la API.
3. **Copia** de todos los archivos existentes al bucket, con verificación por huella (`soportes.huella`) de que cada copia es idéntica.
4. **Cambio** de la API al adaptador nuevo. El disco queda como respaldo: **no borres nada del servidor**; eso es de la fase 7.
5. **Huérfanos:** borrar un movimiento borra también su archivo en Storage, en la misma operación o con una tarea de limpieza programada. Documenta cuántos huérfanos hay hoy en el disco, sin borrarlos.
6. La app iOS y la web no cambian: suben por el mismo endpoint.

Prueba de punta a punta en local con un bucket de desarrollo antes de desplegar.

---

### Informe de la fase

Además de lo habitual del modo autónomo, incluye: el estado de cada punto de la deuda original (resuelto, propuesto o pospuesto, con motivo), el SQL exacto de cada migración, el conteo de huérfanos encontrados y la verificación de que los logs sobreviven a un despliegue.

---

# Parte 3: mejoras globales

## Fase 7: estándares y mantenibilidad

**Cuándo:** al final de todo el proceso, después de la fase 6. No antes.

**Objetivo:** que un desarrollador senior que tome el repositorio no tenga nada que objetar sobre prácticas, porque cada convención está **decidida, escrita, aplicada en todo el repo y verificada por máquina**. Un estándar es una decisión, no una pregunta: lo que sigue son las decisiones **por defecto**, verificadas contra fuentes de 2026 (lista al final). Pero no son la última palabra: en 7.1 Code hace su propia investigación a fondo, compara lo que el repo tiene con estas decisiones y con las alternativas que encuentre, y **puede proponer cambiar cualquiera de ellas** si demuestra, con evidencia, que la alternativa hace a la app más escalable, más mantenible o mejor alineada con las prácticas más adoptadas. Las decisiones finales se fijaron al cerrar 7.1 (`docs/standards/decisions.md`), y a partir de ahí se aplican sin reinterpretarlas.

**Decisiones de partida**

1. **Inglés** para todo lo que ve un desarrollador: archivos, carpetas, identificadores, tablas, columnas, valores de enums, rutas, comentarios, commits, documentación técnica. **Español** solo para textos que ve el usuario, y esos viven centralizados (7.3).
2. **Sí se hacen los renombres que rompen**, con expandir y contraer (7.10).
3. **Paradas y borrados:** la tabla única de [`CLAUDE.md`](../CLAUDE.md).

**Reglas de la fase**

- Un paso por rama, pull request y despliegue. El CI de 7.6 debe estar en verde desde el paso 2 en adelante.
- Un renombre nunca cambia comportamiento. Si al renombrar aparece un error, se corrige en un paso aparte.
- Cada herramienta que se agregue trae su regla escrita en `CONTRIBUTING.md` y su verificación en CI el mismo día. Nada de "después lo documentamos".

---

### 7.1 Investigación y auditoría

**Parte A: investigación propia.** Antes de auditar, investiga a fondo, con fuentes actuales y verificables, para cada área de 7.2 a 7.13:

- Qué recomiendan hoy la documentación oficial de cada herramienta del stack (NestJS, Prisma, React, Vite, TanStack Query, Tailwind, Supabase, Swift) y las guías de referencia más adoptadas en la industria.
- Qué alternativas existen a cada decisión por defecto de esta fase, con su madurez (versión estable, mantenimiento activo, adopción) y su costo.
- Qué hacen proyectos de referencia bien considerados con un stack parecido (monorepo TypeScript con API Nest, SPA React y app iOS).

Criterios para decidir, en este orden: (1) escalabilidad: que el diseño aguante más usuarios, más datos y más pantallas sin rehacerse; (2) mantenibilidad: que un cambio toque un solo lugar y que un desarrollador nuevo entienda el repo en un día; (3) alineación con las prácticas más adoptadas, no con las más nuevas; (4) costo cero y compatibilidad con Hostinger, Supabase y el certificado gratuito de iOS; (5) riesgo de la migración desde lo que existe.

Reglas de la investigación:

- Toda afirmación lleva fuente con fecha. Nada de "se suele hacer" sin evidencia.
- Una alternativa reemplaza a la decisión por defecto solo si gana con claridad en los criterios 1 a 3 **y** no pierde en 4 y 5. En empate, se mantiene la decisión por defecto: cambiar por cambiar es deuda.
- Ninguna herramienta en beta, sin versión estable o sin mantenimiento en los últimos seis meses.
- Cada decisión, se mantenga o cambie, queda en `docs/standards/decisions.md` con: la decisión por defecto, las alternativas evaluadas, los criterios aplicados, la evidencia y la conclusión. Las que cambian se convierten después en ADR.

**Parte B: auditoría.** Produce `docs/standards/audit.md`: para **cada punto de 7.2 a 7.13**, lo que el repo tiene hoy, lo que dice la decisión final de la Parte A, la brecha (cumple, parcial, no cumple, rompe), la evidencia y el paso en que se resuelve. Incluye el **mapa completo de renombres** `actual → nuevo` para archivos, identificadores públicos, tablas, columnas, valores de enums y rutas, separando lo que rompe de lo que no. Incluye las **mediciones base** de 7.9 (sin ellas no hay presupuestos de rendimiento).

**Entrega las dos partes** (hecho: `docs/standards/decisions.md` y `audit.md`); desde su aprobación las decisiones son definitivas para toda la fase. Paradas: la tabla de [`CLAUDE.md`](../CLAUDE.md).

---

### 7.2 Nomenclatura

**Archivos y carpetas**

- `kebab-case` para todo archivo y carpeta: `expense-form.tsx`, `transactions.service.ts`.
- Sufijo por rol en la API, estilo Nest: `.controller.ts`, `.service.ts`, `.repository.ts`, `.dto.ts`, `.module.ts`, `.guard.ts`, `.spec.ts`.
- Pruebas junto a lo que prueban: `expense-form.test.tsx` al lado de `expense-form.tsx`; e2e en `api/test/e2e/*.e2e.ts`.
- Un componente React por archivo, con el mismo nombre en PascalCase: `expense-form.tsx` exporta `ExpenseForm`.
- Sin barrels (`index.ts`) salvo el punto de entrada de cada paquete en `packages/`.

**Identificadores**

- `camelCase` variables y funciones; `PascalCase` tipos, clases, componentes; `UPPER_SNAKE_CASE` constantes de módulo.
- Booleanos con prefijo: `isLoading`, `hasBudget`, `canEdit`.
- Manejadores: `onSubmit` para props, `handleSubmit` para implementaciones.
- Funciones nombradas por verbo: `createTransaction`, `findByUser`. Sin abreviaturas (`transaction`, no `tx`; `category`, no `cat`), salvo `id`, `url`, `api`.
- Tipos sin prefijo `I` ni sufijo `Type`. Uniones de literales en lugar de `enum` de TypeScript.
- Hooks `useX`; stores `useXStore`.

**Base de datos**

- Tablas en plural `snake_case`; columnas `snake_case`; PK `id`; FKs `<singular>_id`.
- Toda tabla con `created_at` y `updated_at` (`NOT NULL`). En 7.2 se añade `updated_at` donde falte; el paso de `timestamp(3)` a `timestamptz(3)` es de la fase 8 (ADR 0026, `docs/adr/0026-database-names-stay-behind-prisma-map.md`).
- Nombres de restricciones e índices: `pk_<table>`, `fk_<table>_<column>`, `uq_<table>_<cols>`, `ck_<table>_<rule>`, `idx_<table>_<cols>`.
- Enums de Postgres con valores en inglés `snake_case`. Hoy `Periodicidad` tiene valores en español: va al mapa de renombres que rompen.
- Migraciones nombradas `YYYYMMDDHHMMSS_<verb>_<object>` en inglés.

**API**

- Rutas: sustantivos en plural, `kebab-case`, sin verbos: `/transactions`, `/cost-centers`. Acciones que no son CRUD como sub-recurso: `/transactions/{id}/receipts`.
- Prefijo versionado: hoy `/api/v2` (la v1 se retiró en 7.10). Cambios que rompen el contrato → versión nueva, nunca cambio en caliente.
- Campos JSON en `camelCase` en la API; el mapeo a `snake_case` lo hace Prisma con `@map`.

**Verificación automática:** `@typescript-eslint/naming-convention` configurada con exactamente estas reglas; `eslint-plugin-check-file` para nombres de archivos y carpetas; una regla propia (script en CI) que falla ante identificadores con palabras en español, con lista de palabras y excepciones explícitas en `scripts/lint/spanish-identifiers.ts`.

---

### 7.3 Textos de usuario

- Ningún texto visible al usuario escrito directamente en componentes. Todos viven en `frontend/src/locales/es.json` (y en el equivalente iOS, `Localizable.xcstrings`), con claves en inglés: `"transactions.form.amount": "Valor"`.
- Formato de moneda y fecha por `Intl` con `es-CO` desde un único módulo.
- **Verificación:** regla de lint que prohíbe literales de texto con letras en JSX fuera del módulo de textos (`react/jsx-no-literals` con excepciones acotadas).

---

### 7.4 Arquitectura

**API (NestJS)**

- Un módulo por recurso: `transactions/`, `categories/`, `receipts/`… Dentro: `controller`, `service`, `repository`, `dto/`, `entities` o `types`, pruebas.
- **Solo los repositorios hablan con Prisma.** Los servicios no importan `PrismaService`. Los controladores no contienen lógica: validan, delegan, responden.
- Lo compartido vive en `common/` y nunca importa de `modules/`.
- Validación de entrada con `class-validator` en DTOs (ya está); validación de **variables de entorno al arrancar** con un esquema único (`zod`), de modo que la API no arranca con configuración incompleta.
- Errores: una jerarquía propia (`DomainError` → `NotFoundError`, `ConflictError`, `ValidationError`) traducida a HTTP en un solo filtro. El formato actual `{ error: { code, message, details } }` se mantiene y se documenta como contrato.
- Respuestas de listas siempre paginadas con cursor: `{ data, meta: { nextCursor, total? } }`.

**Frontend (React)**

- `src/app/` (arranque, rutas, proveedores) → `src/features/<feature>/` (`components/`, `hooks/`, `api/`, `model/`) → `src/shared/` (`ui/`, `lib/`, `api/`). Las features **no se importan entre sí**; lo común sube a `shared`.
- Estado del servidor solo con React Query; estado local con `useState` o un store por feature. Nada de estado global para datos del servidor.
- Componentes de presentación sin acceso a datos; los hooks de la feature encapsulan React Query.
- Límite de **300 líneas por archivo** y **50 por función**, salvo excepciones documentadas en el propio archivo. El modal de movimiento se divide.

**Contrato compartido**

- `packages/types` a mano desaparece. La API expone OpenAPI con `@nestjs/swagger`; el frontend genera sus tipos con `openapi-typescript` y consume la API con `openapi-fetch`, en el `build`. Una sola fuente de verdad: el código de la API. Se evaluó Orval (genera hooks de React Query y mocks MSW); se descarta por ahora para que los hooks sigan siendo explícitos dentro de cada feature. ADR.
- **Prisma 7.** El repo está en Prisma 6 con `@prisma/adapter-pg`, que ya es el modelo de Prisma 7. Se actualiza: `prisma.config.ts` en la raíz (obligatorio para migraciones), `import 'dotenv/config'` porque Prisma 7 ya no carga `.env` solo, generador `prisma-client` con `output` explícito, y los scripts de migración se adaptan a los flags nuevos de `migrate diff` (`--from-config-datasource`). ADR con la guía oficial de actualización.
- `packages/lectura` pasa a `packages/receipt-parser`, puro, sin dependencias de Node ni de navegador.

**Verificación automática:** `dependency-cruiser` con reglas que fallan el CI si un servicio importa Prisma, si `common` importa `modules`, si una feature importa otra, o si hay ciclos. `eslint` con `max-lines` y `max-lines-per-function`.

---

### 7.5 Calidad del código

**Decisión: ESLint + Prettier, no Biome.** Biome 2 es el default razonable para proyectos nuevos en 2026 (un binario, 10 a 25 veces más rápido), pero este repo depende de dos cosas que Biome no cubre igual: las reglas con información de tipos de `typescript-eslint` (`no-floating-promises`, `no-unsafe-*`), que ya atrapan errores reales aquí, y las reglas de `react-hooks` (`set-state-in-effect`, `refs`), que acaban de limpiar 26 problemas. Se revisa en un año. ADR.

- **Un solo** `eslint.config.js` en la raíz, con `typescript-eslint` en modo `strict-type-checked` y `stylistic-type-checked`, más `react`, `react-hooks`, `jsx-a11y`, `import-x` (orden de imports, sin ciclos, sin default exports salvo donde el framework lo exige) y `check-file`. Los workspaces heredan y solo añaden reglas de su entorno.
- `prettier` como única fuente de formato; `eslint` no opina sobre formato.
- `.editorconfig` en la raíz.
- `knip` para detectar código, exportaciones y dependencias sin uso. Falla el CI si encuentra algo no listado como excepción.
- TypeScript: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride` en todos los workspaces. Ningún `any` explícito ni `@ts-ignore`; `@ts-expect-error` solo con motivo escrito.
- Hooks de git con `lefthook`: en `pre-commit`, `lint-staged` (eslint + prettier sobre lo cambiado) y typecheck del workspace afectado; en `commit-msg`, `commitlint`.
- Commits en **Conventional Commits** (`feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `ci`, `perf`), con alcance por workspace: `feat(api): …`, `fix(web): …`, `feat(ios): …`.

---

### 7.6 Git y entrega continua

**Modelo de ramas: trunk-based.**

- `main` es la única rama permanente y la que Hostinger despliega. `Dev` se retira cuando `main` esté configurada.
- Ramas cortas desde `main`: `feat/<slug>`, `fix/<slug>`, `chore/<slug>`. Viven días, no semanas.
- Integración por pull request con **squash merge** e historia lineal. Code abre y mergea sus propios PR cuando el CI está en verde.
- `main` protegida con un **ruleset** (no la protección de rama clásica): checks obligatorios, historia lineal, sin force-push, sin commits directos. La vuelta atrás es un `revert`, nunca un force-push.
- **Restricción del plan gratuito de GitHub:** en un repositorio privado, las reglas de protección y `CODEOWNERS` no se aplican (requieren GitHub Pro en cuenta personal o Team en organización). Mientras el repo sea privado y gratuito, se aplican controles compensatorios: `lefthook` en `pre-push` ejecuta la verificación completa; el merge se hace solo con `scripts/merge.sh`, que corre `gh pr checks --watch` y rehúsa si algún check falló antes de `gh pr merge --squash`; `CLAUDE.md` prohíbe el push directo a `main`; y un job en `main` que, si el build falla, abre un issue y revierte el commit. Si en algún momento se activa GitHub Pro (unos US$4 al mes), se configura el ruleset y los controles compensatorios se quedan como segunda capa. ADR.
- Versionado semántico automático con `release-please`: genera `CHANGELOG.md`, etiqueta `vX.Y.Z` y nota de versión a partir de los commits.
- Plantilla de PR con lista de verificación (pruebas, docs, ADR si aplica, migración aditiva) y plantillas de issue. `CODEOWNERS` solo cuando el plan lo haga efectivo.

**CI en GitHub Actions**

- `ci.yml` en cada PR y en `main`: `npm ci` con caché, typecheck, lint, formato, `knip`, `dependency-cruiser`, pruebas unitarias con cobertura, **e2e de la API contra un Postgres de servicio**, build de la API y del frontend, y los presupuestos de 7.9. Todo obligatorio para mergear.
- `security.yml`: `gitleaks` (secretos), `npm audit` con fallo en severidad alta o crítica, y `Dependabot` semanal agrupado por tipo.
- iOS en CI: `swiftlint`, `swift-format lint` y `xcodebuild test` en simulador, en runner macOS. **Cuota:** el plan gratuito da 2.000 minutos al mes en repos privados y cada minuto de runner macOS consume 10 minutos de cuota, así que este workflow corre solo por `workflow_dispatch` y antes de cada versión de la app; las verificaciones rutinarias de Swift van en `pre-commit`.

**Despliegue**

- Hostinger despliega desde `main`. El cambio de rama se hace en el mismo paso que protege `main`, sin dejar producción sin despliegue posible. Si exige el panel de Hostinger y no tienes acceso, ver la tabla de paradas de [`CLAUDE.md`](../CLAUDE.md).
- Migraciones: siguen siendo un paso explícito y previo al despliegue de código (regla general 3). El runbook (7.12) documenta el procedimiento exacto, incluida la vuelta atrás.

---

### 7.7 Pruebas

- **Pirámide:** unitarias (lógica pura, repositorios con base real), de componente (Testing Library, comportamiento, no implementación), e2e de la API (`supertest`, un flujo por recurso, contra Postgres), y para el frontend una docena de recorridos críticos con Playwright (login, registrar gasto manual, con foto, marcar varios pagos, ver pendientes).
- **Cobertura mínima en CI:** 80 % líneas y ramas en `api/src` y `packages/`; 70 % en `frontend/src`. Sube con el tiempo, nunca baja.
- **Nombres:** `describe` con la unidad; `it` con el comportamiento en presente: `it('rejects a concept that is both auto-paid and multi-payment')`.
- Datos de prueba por fábricas (`makeTransaction({ amount: 100 })`), sin fixtures gigantes; sin pruebas que dependan del orden (ya hubo una frágil).
- Las pruebas de regla de diseño del frontend se conservan y se documentan como parte del estándar.
- Sin mocks de Prisma: los repositorios se prueban contra la base local.

---

### 7.8 Feature flags

- Se adopta el estándar abierto **OpenFeature**: `@openfeature/nestjs-sdk` en la API y `@openfeature/react-sdk` en la web, con un **provider propio** (sin servicio externo) que resuelve dos fuentes: **de servidor**, por variable `FEATURES=flag_a,flag_b` validada al arrancar; **por usuario**, en `user_preferences` con clave `feature:<name>`. El código que evalúa flags usa solo la API de OpenFeature, así que cambiar de proveedor en el futuro no lo toca.
- Registro único en `packages/flags/registry.ts`: nombre, descripción, dueño, fecha prevista de retiro. Una flag fuera del registro no compila.
- La API expone las flags activas del usuario en `/auth/me`; el frontend las lee con los hooks de OpenFeature (`useBooleanFlagValue`); iOS con `FeatureFlags.isEnabled(.name)` sobre esa misma respuesta.
- Regla de vida: una flag se crea para desplegar algo a oscuras o por usuario, y **se elimina** cuando el despliegue termina. Un script en CI avisa cuando una flag supera su fecha de retiro y falla si la supera por más de 30 días.

---

### 7.9 Rendimiento

- **Medir primero**, en 7.1: tiempo p50/p95 de `/dashboard`, `/transactions` y `/transactions/capture` contra la base local con datos realistas; tamaño del bundle inicial del frontend (gzip); Lighthouse móvil de login, dashboard y ficha de movimiento.
- **Presupuestos** fijados a partir de la medición: p95 de la API ≤ 300 ms en local; bundle inicial ≤ 200 kB gzip; Lighthouse rendimiento ≥ 90 en móvil. Si la medición base ya está mejor, el presupuesto es la medición base menos un 10 % de margen.
- **Verificación en CI:** `size-limit` para el bundle y Lighthouse CI para los tres recorridos; ambos bloquean el PR si rompen el presupuesto.
- Optimizaciones solo donde la medición lo justifique, cada una con su ADR y sus números antes y después. Candidatos conocidos: consultas N+1 en el dashboard, `tesseract.js` fuera del bundle inicial (import dinámico ya existe; verificar), imágenes de soportes servidas con tamaño correcto.

---

### 7.10 Renombres que rompen: expandir y contraer

Cada renombre de columna, tabla, valor de enum o ruta sigue este procedimiento, en despliegues separados:

1. **Expandir.** Migración aditiva: columna o tabla con el nombre nuevo (o enum nuevo). El código escribe en ambos y lee del nuevo; se rellena el nuevo desde el viejo en la misma migración o en un script idempotente. Para rutas: la ruta nueva convive con la vieja; la vieja responde igual, con cabecera `Deprecation` y registro de cada uso.
2. **Verificar.** Tras el despliegue: consulta que confirma que viejo y nuevo coinciden fila a fila; recorridos e2e en verde; para rutas, log con cero usos de la vieja durante **una hora tras desplegar los clientes** (decisión del dueño, 6 oct 2026; antes eran siete días), como fija la tabla de paradas de [`CLAUDE.md`](../CLAUDE.md).
3. **Contraer.** Con las condiciones de la tabla de paradas de [`CLAUDE.md`](../CLAUDE.md) (respaldo completo y restauración probada justo antes, y lo que no se borra en esta fase). El SQL exacto de cada borrado y la evidencia de la verificación quedan en el registro. Todos los borrados de la fase, en un solo paso al final: columnas y tablas viejas, valores de enum viejos, rutas viejas y los archivos de soportes del disco del servidor que la fase 6 dejó como respaldo.

La app iOS se reinstala cada 7 días, así que no hay clientes viejos atrapados; aun así, la web y la app pasan a las rutas nuevas antes de contraer.

**Hecho para las rutas (6 oct 2026, paso 7.10-v1):** la v1 se retiró tras más de cinco horas sin usos con la web y iOS ya en la v2. Fuera sus controladores, DTO, presentadores, el traductor v1↔v2, la cabecera `Deprecation`, el registro `v1_used` y su contador, `openapi.v1.json` y su chequeo de CI; los servicios reciben tipos de dominio en inglés y el puente de la app con la web habla la sesión de la v2. La base no tiene columnas, tablas ni valores viejos que contraer: conserva sus nombres detrás de `@map` ([ADR 0026](adr/0026-database-names-stay-behind-prisma-map.md)). Lo que queda —variables de entorno viejas, rutas web en español y soportes del disco del servidor— es el paso 8.7, con su criterio y su salvaguarda.

---

### 7.11 Seguridad y operación

- **Defensa en profundidad en la base:** la API deja de conectarse como dueña. Rol `app` con `NOBYPASSRLS`; `ENABLE` y `FORCE ROW LEVEL SECURITY` en todas las tablas de usuario; políticas `USING (user_id = current_setting('app.current_user_id', true)::bigint)` y el mismo `WITH CHECK`; índice en `user_id` en cada tabla. La API fija el usuario con `SELECT set_config('app.current_user_id', $1, true)` **dentro de `prisma.$transaction`**, de modo que el valor viaja en la misma conexión y se borra al terminar: es obligatorio porque la app usa el pooler de Supabase en modo transacción (puerto 6543), donde dos llamadas sueltas pueden caer en conexiones distintas. Así la prueba de aislamiento de la fase 6 tiene una segunda línea detrás. Si la medición de 7.9 muestra un costo inaceptable, se documenta en ADR y se mantiene solo la prueba.
- Secretos solo en variables de entorno validadas; `.env.example` completo; `gitleaks` en CI y en `pre-commit`.
- Cabeceras (`helmet`), CORS explícito, límites de peticiones por ruta: ya existen; se documentan y se prueban.
- Logs estructurados con identificador de petición (fase 6), **sin datos personales ni montos** en los logs; una regla escrita y una prueba que lo verifique en el filtro de errores.
- `/health` público y `/ready` que comprueba la base; el runbook dice qué hacer cuando fallan.
- Dependencias actualizadas por `Dependabot`; parches de seguridad se integran en la semana.

---

### 7.12 Documentación

- **`README.md`:** qué es, arquitectura en un párrafo con enlace, requisitos, cómo instalar, correr, probar y desplegar cada parte (API, web, iOS), y enlaces al resto.
- **`docs/architecture.md`:** diagramas C4 de contexto y contenedores en Mermaid, flujos principales (registro manual, con foto, Wallet, SMS), decisiones clave con enlace a su ADR.
- **ADR en formato MADR** en `docs/adr/NNNN-title.md`, uno por decisión relevante, incluidas las de las fases anteriores (motor en la API, idempotencia por `external_ref`, híbrido en iOS, expandir y contraer, trunk-based, RLS con rol propio). Un ADR nunca se edita: se reemplaza por otro que lo sustituye.
- **API:** OpenAPI generada desde el código, servida en `/api/docs` solo fuera de producción, y publicada como artefacto del CI.
- **`docs/runbook.md`:** despliegue, vuelta atrás, migraciones (expandir y contraer), respaldos y restauración, rotación de secretos, renovación del certificado iOS cada 7 días, qué hacer si el despliegue falla, si la base no responde o si Supabase Auth cae.
- **`CONTRIBUTING.md`:** todas las convenciones de 7.2 a 7.11 en un solo documento, con ejemplos correctos e incorrectos de cada una, y la lista de verificación del PR.
- **`CHANGELOG.md`** generado por `release-please`.
- **`ios/README.md`:** estructura, convenciones Swift, instalación y renovación.

---

### 7.13 iOS

- Formato con `swift-format`, la herramienta oficial del proyecto Swift incluida en Xcode 16 y posteriores, con `.swift-format` en la raíz de `ios/`; reglas con `SwiftLint` en configuración estricta. Ambos en `pre-commit` cuando cambia `ios/` y en el CI de iOS (7.6).
- Estructura por feature (`Features/Capture`, `Features/Session`, `Features/Web`), `Core/` para red, almacenamiento y Keychain, `Shared/` para UI común.
- `async/await` en toda la capa de red; sin force-unwrap (`!`) fuera de pruebas; errores tipados por dominio.
- Pruebas con el framework de Xcode para la cola, el cliente de red (con stubs) y la lógica de intents; sin pruebas que necesiten red real.
- Localización en `Localizable.xcstrings` con claves en inglés (7.3).

---

### 7.14 Que se mantenga solo

Las convenciones no sirven si dependen de que alguien se acuerde. Tres capas, en este orden:

**Capa 1: la máquina lo impide.** Cada regla de 7.2 a 7.13 tiene su verificación en `pre-commit` o en CI, y el PR no se puede mergear si falla. Es la única capa que garantiza algo. Una regla que no se puede verificar por máquina se marca como tal en `CONTRIBUTING.md`, y son la excepción.

**Capa 2: Claude Code lo lee en cada sesión.** `CLAUDE.md` en la raíz, que Claude Code carga automáticamente al iniciar cualquier sesión en el proyecto. Menos de 200 líneas, con esta estructura:

1. Qué es el proyecto y cómo está organizado (diez líneas).
2. Comandos: instalar, correr, typecheck, lint, pruebas, e2e, generar el cliente de la API.
3. Convenciones en una línea cada una, con enlace a la sección de `CONTRIBUTING.md` que la detalla.
4. Reglas que nunca se rompen: nada a `main` sin PR y CI en verde; migraciones aditivas por defecto y expandir y contraer para lo que rompe; nunca código antes que esquema; nunca secretos ni datos personales en código, logs o pruebas; textos de usuario solo en `locales`.
5. Qué hacer ante una decisión no cubierta: escribir el ADR antes de implementar.
6. Dónde está todo: `CONTRIBUTING.md`, `docs/architecture.md`, `docs/adr/`, `docs/runbook.md`.

Reglas por zona en `.claude/rules/`: `api.md`, `web.md`, `ios.md`, `database.md`, cada una con lo específico de esa parte, para que se carguen según dónde se trabaje.

**Capa 3: los humanos lo leen.** `CONTRIBUTING.md`, arquitectura, ADR y runbook. Es la fuente completa; `CLAUDE.md` la resume y la referencia.

**Regla de coherencia:** las tres capas dicen lo mismo. Si una convención cambia, se cambia en las tres en el mismo PR, y la plantilla de PR lo pregunta.

---

### Lista de verificación del senior

Al terminar, el informe incluye esta lista con evidencia de cada punto. Cada uno acaba en **hecho** (con su PR o commit), **pospuesto** (con su ADR o su sitio en la fase 8) o **descartado** (con su ADR). Contrastada contra `Dev` en `50b7d08` (9 oct 2026, paso J-6b), con la revisión independiente de J-6. El informe de cierre es [`docs/phase-7-report.md`](phase-7-report.md).

| Punto                                                                                                         | Estado    | Evidencia                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ningún identificador en español en código, base, rutas ni comentarios                                         | Pospuesto | Identificadores, rutas y la v2 en inglés (7.2, `lint:spanish` en CI); la base conserva sus nombres ([ADR 0026](adr/0026-database-names-stay-behind-prisma-map.md)). Quedan 76 nombres de archivo (sobre todo `e2e/`) y comentarios de iOS: fase 8                                                     |
| Textos de usuario solo en `locales`                                                                           | Hecho     | 7.3 ([ADR 0011](adr/0011-i18next-no-literal-string.md), [0025](adr/0025-text-catalog-loads-beside-the-entry.md)); atributos vigilados desde J-3 (`e6e1f1a`). Los mensajes de la API, fuera de un catálogo: fase 8                                                                                     |
| Un solo `eslint.config.js`, Prettier, `.editorconfig`; `knip` y `dependency-cruiser` en verde                 | Hecho     | `eslint.config.js`, `.prettierrc.json`, `.editorconfig`, `knip.jsonc`, `.dependency-cruiser.cjs`, todos en `ci.yml` (`63cc121`)                                                                                                                                                                       |
| `main` protegida; trunk-based; squash                                                                         | Pospuesto | [ADR 0009](adr/0009-trunk-based-with-dev-as-deploy-branch.md): `Dev` despliega y `scripts/merge.sh` es el control (todos los checks en verde, espera a todas las ejecuciones desde `4ee0875`)                                                                                                         |
| `release-please` funcionando; `CHANGELOG` generado                                                            | Pospuesto | [ADR 0028](adr/0028-release-please-waits-for-the-owner.md): apagado hasta que el dueño cree `RELEASE_PLEASE_TOKEN`                                                                                                                                                                                    |
| CI obligatorio: typecheck, lint, formato, cobertura mínima, e2e con Postgres, build, seguridad y presupuestos | Hecho     | `ci.yml` por áreas (`26de7e7`), `security.yml`, `perf.yml`; cobertura API 80/80, web 70/66 ([ADR 0029](adr/0029-web-branch-coverage-floor-at-66.md))                                                                                                                                                  |
| Hostinger despliega desde `main`; `Dev` retirada                                                              | Pospuesto | [ADR 0009](adr/0009-trunk-based-with-dev-as-deploy-branch.md) (cambio en hPanel, acción del dueño)                                                                                                                                                                                                    |
| Contrato de la API generado desde OpenAPI; `packages/types` eliminado                                         | Hecho     | `d054b4d`, `a122f34`, `dfdfc9a` (#43), [ADR 0013](adr/0013-orval-fetch-client.md)                                                                                                                                                                                                                     |
| Servicios sin Prisma; features sin importarse entre sí                                                        | Hecho     | 7.4-api y 7.4-web, `depcruise` y `scripts/ci/table-ownership.mjs` en CI; `forUser` con RLS (#31) y Prisma 7 (#35, [ADR 0020](adr/0020-prisma-7.md)) integrados                                                                                                                                        |
| Ningún archivo de más de 300 líneas sin excepción documentada                                                 | Hecho     | API y web sin excepciones; `packages/receipt-parser/src/dictionary.ts` y `classify.ts`, excepción temporal escrita en `eslint.config.js`                                                                                                                                                              |
| Toda tabla con `created_at` y `updated_at`; restricciones e índices con nombre normalizado; enums en inglés   | Pospuesto | `updated_at` en todas, nombres normalizados y valores de enum en inglés (`f7e2f1e`); `created_at` en cuatro tablas y `timestamptz`: fase 8, 8.4                                                                                                                                                       |
| Rutas viejas, columnas viejas y archivos del disco eliminados, con respaldo previo                            | Pospuesto | La v1 se retiró (7.10-v1); la base no tiene columnas viejas ([ADR 0026](adr/0026-database-names-stay-behind-prisma-map.md)). Variables viejas, rutas web en español y soportes en disco: 8.7                                                                                                          |
| Tablas de `imports` eliminadas                                                                                | Pospuesto | [ADR 0031](adr/0031-import-tables-stay-until-the-owner-decides.md); decisión del dueño en 8.6                                                                                                                                                                                                         |
| RLS con rol `app` y políticas, o ADR que explica por qué no                                                   | Hecho     | [ADR 0010](adr/0010-rls-with-application-role.md), [0019](adr/0019-rls-for-user-cross-user-paths-and-cost.md), [0024](adr/0024-rls-active-in-production.md), [0027](adr/0027-app-role-creates-only-pending-users-or-the-first-admin.md); falta que el dueño aplique la migración de J-5 en producción |
| Logs estructurados sin datos personales; `/health` y `/ready`                                                 | Hecho     | `800541c`, `0e68fa3`, sondas en la v2 (`6c95e40`, #38); `no-personal-data.spec.ts`                                                                                                                                                                                                                    |
| Feature flags con registro, dueño y fecha de retiro; ninguna vencida                                          | Hecho     | `4e5dfa4` (`scripts/ci/flags-expiry.mjs` en CI), [ADR 0015](adr/0015-openfeature-server-sdk.md). En iOS no hay flags todavía: fase 8                                                                                                                                                                  |
| Presupuestos de rendimiento definidos desde medición y verificados en CI                                      | Hecho     | `8d57354`, `f389e54`, `eafcfee`; [ADR 0016](adr/0016-lighthouse-cli-script.md), [0017](adr/0017-dashboard-reads-bounded-history.md), [0018](adr/0018-screens-load-on-demand.md)                                                                                                                       |
| README, arquitectura, ADR, OpenAPI, runbook, CONTRIBUTING, CHANGELOG, README de iOS                           | Hecho     | Todos existen; el `CHANGELOG` lo escribe release-please ([ADR 0028](adr/0028-release-please-waits-for-the-owner.md))                                                                                                                                                                                  |
| `CLAUDE.md` en 80 líneas o menos, con `.claude/rules/` por zona, coherente con `CONTRIBUTING.md`              | Hecho     | 64 líneas, tabla única de paradas; `api.md`, `database.md`, `ios.md` y `web.md` (7.14, `aa69952`)                                                                                                                                                                                                     |
| iOS con `swiftlint`, formateador, estructura por feature                                                      | Hecho     | `73e7662`, `cc29fe9`, `54e1667`, #39                                                                                                                                                                                                                                                                  |
| Pruebas de iOS en CI                                                                                          | Pospuesto | [ADR 0030](adr/0030-ios-ci-not-on-every-push.md): solo donde cambia iOS, por la cuota de macOS                                                                                                                                                                                                        |
| Hallazgos de la revisión externa (bloque I)                                                                   | Hecho     | I.1 en #44, #47, #48, #49 y R-2-v2; I.2 en la fase 8 (8.3)                                                                                                                                                                                                                                            |
| `docs/standards/audit.md` con cada hallazgo resuelto, pospuesto o descartado, con motivo y ADR                | Hecho     | [`docs/standards/audit-closing.md`](standards/audit-closing.md)                                                                                                                                                                                                                                       |

---

### Fuentes consultadas para estas decisiones (octubre de 2026)

- Biome frente a ESLint y Prettier: https://www.pkgpulse.com/guides/biome-vs-eslint-vs-oxlint-2026 · https://kanopylabs.com/blog/biome-vs-eslint-prettier · https://devtoolbox.blog/biome-vs-eslint-prettier-2026-2/
- Prisma 7, guía oficial de actualización: https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7
- OpenFeature, SDKs de JavaScript (Nest y React): https://github.com/open-feature/js-sdk
- RLS con `set_config` transaccional y pooler: https://supabase.com/docs/guides/ai/rag-with-permissions.md · https://github.com/prisma/orm/discussions/25034
- Clientes tipados desde OpenAPI: https://www.pkgpulse.com/guides/orval-vs-openapi-typescript-vs-kubb-openapi-client-2026
- Herramientas de versionado (release-please, Changesets, semantic-release): https://www.tenki.cloud/blog/release-automation-github-actions
- Protección de ramas y planes de GitHub: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches · https://www.ssw.com.au/rules/which-github-plan
- `swift-format` incluido en Xcode 16: https://mjtsai.com/blog/2024/11/06/swift-format-in-xcode-16
- `CLAUDE.md` y `.claude/rules/`: https://code.claude.com/docs/en/memory

---

# Parte 4: después de la fase 7

## Fase 8: acierto, captura y lo que quedó anotado

**Cuándo:** después de cerrar la fase 7. Aquí solo se anota; cada punto se abre como paso propio, con su rama y su PR.

**Fuente:** la revisión externa del 5 oct 2026 (`reto-del-plan-2026-10-05.md`, fuera del repo), la revisión independiente de J-6 y los traspasos de la fase 7 (destilados en 8.8). La métrica de 8.2 decide el orden del resto.

### 8.1 El clasificador

- Una regla solo da certeza «alta» después de dos o tres aciertos (`hits` ya existe); hoy basta una confirmación para crear una regla de una palabra que ya pasa el umbral y guarda el gasto sin «por revisar».
- Comparar por palabra y no por subcadena, y consultar el historial con el comercio, no con el SMS entero.
- iOS nunca llama a `learn`: se aprende en el servidor al capturar y al resolver un «por revisar». Con prueba e2e.

### 8.2 Corpus y métricas

- Un corpus etiquetado de 30 a 50 casos anonimizados (recibos, SMS, Wallet) con su resultado esperado; el acierto por campo se mide en CI y falla si baja.
- Una consulta semanal de captura por `source`, «por revisar» y fallidas: lo que se escapa sin registrarse hoy no aparece en ninguna métrica.

### 8.3 Lo que puede esperar (revisión externa, «Puede esperar»)

- iOS: un intent con `IntentFile` que reciba imagen o PDF desde la hoja de compartir o una captura de pantalla, sin App ID nuevo. Es lo primero de la fase.
- Para un comprador: borrar la cuenta y exportar los datos (Apple 5.1.1(v) y Ley 1581), una `LICENSE` propietaria y un Supabase aparte para desarrollo.
- Documentación: runbook del dueño en español, `AGENTS.md` como canónico, Engram solo con punteros y un plan activo con un encabezado por subpaso.
- Clasificación: dos almacenes de palabras clave (uno no se ve en la interfaz), reglas sembradas muertas, el monto interpretado tres veces y la web armando su propia precedencia contra el ADR 0004.
- ADR que falta: el throttler en memoria por proceso. (El de la cobertura del frontend es el [ADR 0029](adr/0029-web-branch-coverage-floor-at-66.md).)

### 8.4 API y base

- Ruta de la v2 para buscar un movimiento por `externalRef` (filtro en `GET /v2/transactions` o ruta propia), para que iOS adjunte sola la foto de un duplicado.
- `timestamp(3)` → `timestamptz(3)` en las 14 columnas (ADR 0026, punto 4): cambio de tipo, va por expandir y contraer en su propio paso; los valores ya son UTC, pero una sesión fuera de UTC desplazaría fechas.
- `created_at` en `tags`, `transaction_splits`, `transaction_tags` y `user_preferences`: primero la columna anulable; el relleno lo decide el dueño, porque `now()` falsearía la fecha de creación de las filas viejas.

### 8.5 Verificación

- knip 6 no detecta métodos de clase muertos y ningún check del CI los atrapa: buscar una verificación que lo haga o dejar escrito en un ADR por qué no.

### 8.6 Decisiones del dueño pendientes

- La importación de extractos: qué se hace con las tablas `import_*`, que no se borran en la fase 7 (tabla de paradas de [`CLAUDE.md`](../CLAUDE.md), [ADR 0031](adr/0031-import-tables-stay-until-the-owner-decides.md)).
- Cómo comparte iOS la lectura de documentos: hoy vive en `packages/receipt-parser`, en TypeScript, y iOS no la usa.

### 8.7 La contracción de 7.10 (paso propio)

Lo que 7.10 dejó expandido y todavía no se contrajo. **No se hace hasta que se cumpla su criterio**, y es un solo paso con su rama y su PR.

| Qué se quita                                                                                                                                                                                                                                                            | Cuándo                                                                                                                                                                                                                                              |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Variables de entorno viejas** (`SOPORTES_*`, `PERMITIR_*`): las líneas viejas del `.env` del servidor y su copia `.env.before-r3`; en el código, `RENAMED_ENV`, el respaldo de `readEnv`, `renamedEnvWarnings` y su llamada, y el `?? SOPORTES_BUCKET` de los scripts | **14 días seguidos** de `api.log` sin ningún aviso `deprecated name`, contados desde el último despliegue, y un `api/.env.example` que ya no las nombra                                                                                             |
| **Rutas web en español**: `legacy-routes.tsx` y su recorrido, los parámetros y rangos viejos de los filtros (`?rango=anio-pasado`…), la lectura de `sidenav-plegada` y la clave `cuentas_habilitadas` de las preferencias                                               | **30 días** sin una sola petición a las rutas viejas en el registro de accesos del hosting. Si el hosting no lo guarda, antes se cuenta en la propia web (un aviso al log de la API al redirigir, sin datos de la persona) y se esperan los 30 días |
| **Soportes en el disco del servidor**: la carpeta que la fase 6 dejó como respaldo al pasar al bucket                                                                                                                                                                   | Cuando el respaldo completo del bucket se haya restaurado en limpio y el recuento de objetos y huellas coincida con la tabla `soportes`; y nunca antes de las otras dos filas                                                                       |

**Salvaguarda, sin excepciones** (tabla de paradas de [`CLAUDE.md`](../CLAUDE.md)): justo antes de borrar nada del servidor, `scripts/backup.sh` completo (`public` + `auth` + bucket, cifrado, fuera del portátil), y `scripts/restore.sh` de ese mismo respaldo en una base desechable, con los recuentos comparados. Además, la carpeta de soportes se copia entera a `$COCO_DATA_DIR` y se verifica por huella antes de borrarla del servidor. El borrado en el servidor lo hace el dueño o se hace con su orden explícita; el SQL o los comandos exactos y la evidencia van al registro.

**Orden:** primero el código que deja de leer lo viejo (un despliegue), luego el borrado en el servidor (otro), igual que un expandir y contraer. Si un aviso `deprecated name` aparece después del primer despliegue, se para y se vuelve atrás.

### 8.8 Lo que quedó en los traspasos de la fase 7

Los traspasos de la fase 7 se borraron al cerrarla (9 oct 2026). Lo que seguía vivo y no estaba ya en otro punto de esta fase:

- **Web:** Google Fonts bloquea el primer pintado (`frontend/index.html`); la ficha del movimiento da CLS 0,199 al abrirse; `window.onerror` no llega a la API; un recorrido con el CDN bloqueado y una imagen de verdad; las features sin `model/` (`bank-accounts`, `admin`, `profile`) tienen la lógica dentro de las páginas.
- **API:** el cobro automático del arranque no espera al apagado (un `Transaction not found` cuando LiteSpeed reinicia a mitad); el limitador vive en memoria por proceso (ya en 8.3); un 500 registra el stack y un error de validación de Prisma podría traer valores en su mensaje: revisar; `activeFor` lee las preferencias una vez por flag (cachear por petición si el registro crece) y no hay pantalla para encender una flag.
- **Dependencias:** el override de `js-yaml` se va al subir a Nest 12; las excepciones de Prisma de `scripts/ci/audit.mjs`, cuando salga una estable con sus dependencias al día; el árbol de desarrollo (Jest 29, `braces`) fuera de la compuerta.
- **iOS:** las cadenas del Info.plist siguen en `project.yml` (irían en un `InfoPlist.xcstrings`); decidir si los App Intents se localizan; errores del Keychain que cierran la sesión; Swift Testing; aprovechar los `errors` por campo; `FeatureFlags` en la app; bajar el timeout de su job cuando haya una duración medida; `xcodebuild test` a veces se cuelga después de terminar (aserción del simulador).
- **Operación:** un aviso semanal si el último respaldo tiene más de 7 días; probar la restauración en un proyecto de Supabase nuevo (hoy solo se prueba en una base desechable); los valores `si` de las dos válvulas pasarían a `true` por expandir y contraer, si se quiere.
- **Verificación de las fases 0 a 5:** dos puntos sin evidencia de cierre, la prueba de que un concepto archivado no sale en pendientes y un inicio de sesión real del dueño en producción.
- **Modo de trabajo:** cada ejecutor en paralelo usa sus propias bases `*_test`; las que dejan los pasos se borran al cerrarlos.

---

# Anexo: especificación original de las fases 0 a 5

Referencia contra la que se verifica la Parte 1. Es el texto que se le entregó a Code en su momento; las paradas que menciona quedaron sin efecto por el modo autónomo, y la fase 5 ya incorpora el enfoque híbrido.

### Fase 0: base segura

**Objetivo:** que ningún cambio ni prueba local pueda tocar los datos reales, y que el código quede verificado por lint.

#### 0.1 Entorno local contra base local

- `api/.env` debe apuntar al Postgres local (el mismo de `api/.env.migrate`). Producción solo debe usarse desde archivos explícitos como `api/.env.supabase`, nunca por defecto.
- Agrega una protección en el arranque: si `NODE_ENV` no es `production` y `DATABASE_URL` apunta al host de Supabase, la API no arranca y explica por qué.
- `SOPORTES_DIR` en local debe apuntar a una carpeta local, para que base y archivos queden siempre en el mismo entorno.
- Resuelve cómo iniciar sesión en local sin escribir en producción. La autenticación hoy va contra Supabase Auth de producción. Si la solución implica crear usuarios en Supabase Auth, **propónmela antes de implementarla**.
- Deja la base local con datos de prueba suficientes para probar la Fase 1: un usuario, la plantilla y algunos conceptos recurrentes, uno de ellos "Mercado" con presupuesto.

#### 0.2 Lint del frontend

- Crea `frontend/eslint.config.js`, coherente con la configuración de la API, y haz que `npm run lint` corra.
- Corrige lo que se pueda corregir automáticamente. Del resto, repórtame cuántos errores hay y de qué reglas, sin corregirlos todavía, si son muchos.

#### 0.3 Lint de la API

- Corrige los 8 errores de `api/src/modules/auth/supabase-auth.service.ts`.

#### 0.4 `.env.example`

- Actualiza `api/.env.example` con todas las variables obligatorias: solo nombres y una línea de descripción, sin valores.

#### Terminado cuando

- Typecheck y lint pasan en los cuatro workspaces (o el lint del frontend queda con un reporte de pendientes acordado conmigo).
- La API local no puede conectarse a producción por accidente.
- La app corre de punta a punta en local con los datos de prueba.

**Detente y repórtame.**

---

### Fase 1: conceptos que se pagan en varias veces

**Problema:** un concepto recurrente desaparece de "Pagos pendientes" en cuanto tiene un movimiento `cleared` en el mes (`dashboard.module.ts`, alrededor de las líneas 531 y 551). Para conceptos que se pagan en varias compras, como el mercado, el botón para registrar desaparece después de la primera.

**Solución acordada:** un campo nuevo por concepto que indica que se paga en varias veces. Apagado por defecto: los conceptos que no lo tengan se comportan exactamente igual que hoy.

#### 1.1 Modelo

- Nueva columna en `categories`: `varios_pagos`, `BOOLEAN NOT NULL DEFAULT false`.
- Genera la migración con `scripts/nueva-migracion.sh`, solo contra la base local.
- Agrega el campo al contrato compartido en `packages/types`.

#### 1.2 Validación (DTO)

- `varios_pagos = true` solo se permite en conceptos (nivel 3) recurrentes.
- Es incompatible con `pago_automatico = true`, porque el cobro automático crea un solo movimiento por mes. Si llegan los dos, la API responde 422 con un mensaje claro.

#### 1.3 Lista de pagos pendientes

Para un concepto con `varios_pagos = true`:

- Sigue en la lista mientras lo pagado (`cleared`) en el mes sea menor que lo esperado (`expected_amount`: el presupuesto o el promedio, como hoy).
- La respuesta incluye también lo pagado en el mes, para mostrar el avance.
- Sale de la lista cuando lo pagado alcanza o supera lo esperado.
- Si no hay un valor esperado mayor que 0 (presupuesto en 0 o sin historial para estimar), se comporta como hoy.

Además, excluye de la lista de pendientes los conceptos archivados. Ojo: según la auditoría, la consulta de categorías del dashboard (alrededor de la línea 220) también alimenta otros cálculos. El filtro debe aplicar **solo a pendientes**, sin afectar los agregados históricos.

#### 1.4 Indicador "Presupuesto necesario"

- Para conceptos con `varios_pagos = true`, cuenta el mayor entre lo pagado y lo esperado. Hoy cuenta lo pagado, y con la primera compra del mes el indicador se queda corto.
- Para el resto de conceptos, sin cambios.

#### 1.5 Interfaz

- **Ficha del concepto:** interruptor "Se paga en varias veces", visible solo si el concepto es recurrente. Si tiene pago automático, el interruptor aparece deshabilitado con una explicación breve, y viceversa.
- **Tarjeta de pagos pendientes:** para estos conceptos, muestra el avance (por ejemplo, "$350.000 de $800.000") y una acción "Registrar otro". Esa acción abre la ficha de movimiento con el concepto y la fecha de hoy precargados, y el **valor vacío**.
- Respeta las pruebas de reglas de diseño existentes del frontend.

#### 1.6 Pruebas

Lógica de pendientes:

- Concepto sin la marca: igual que hoy.
- Con la marca y lo pagado menor que lo esperado: sigue visible, con avance.
- Con la marca y lo pagado igual o mayor que lo esperado: sale de la lista.
- Con la marca y sin valor esperado mayor que 0: igual que hoy.
- Concepto archivado: no aparece en pendientes, pero sí en los agregados históricos.

Indicador: con la marca cuenta el mayor entre lo pagado y lo esperado; sin la marca, sin cambios.

DTO: rechaza la marca junto con pago automático, y la rechaza en niveles 1 y 2 o en conceptos no recurrentes.

Frontend: el interruptor de la ficha y la acción "Registrar otro" de la tarjeta.

#### Terminado cuando

- Pruebas, typecheck y lint pasan.
- En local, con "Mercado" marcado: dos compras dejan la tarjeta visible con el avance correcto, y la tarjeta sale de la lista al alcanzar lo esperado.
- La migración **no** se ha aplicado a producción.

**Detente y repórtame.**

---

### Paso intermedio (entre la fase 1 y la fase 2): react-hooks

Los 26 errores de `react-hooks/set-state-in-effect` y `react-hooks/refs` que quedaron pendientes de la fase 0.

- Empieza por `movimiento-modal.tsx`, porque la fase 2 lo reescribe en parte.
- Cada error se lee y se corrige entendiendo el comportamiento que protege. Ningún cambio de comportamiento visible: si corregir uno exige cambiar lo que hace la pantalla, repórtamelo en vez de decidirlo.
- No desactives las reglas ni las bajes a advertencia.
- Las 275 pruebas del frontend siguen pasando.

**Detente y repórtame.** Después empieza la fase 2.

---

### Fase 2: registro rápido

**Puntos de parada:** dos. Al terminar 2.1 y 2.2, y antes de implementar 2.3 (para revisar el borrador del diccionario).

#### Problema

Para clasificar un gasto, la ficha de movimiento pide en cascada centro de costos, categoría y concepto. Son siete interacciones con la clasificación completa, contra cuatro sin clasificar. El resultado es que clasificar se vuelve tedioso.

#### Objetivo

El sistema propone la clasificación siempre que pueda. Cuando no puede, el usuario busca directamente el concepto y el resto se completa solo. Meta: un gasto con clasificación completa en **cinco interacciones o menos**, y en cuatro cuando la sugerencia acierta.

---

#### 2.1 Búsqueda por concepto

- El campo principal de clasificación en `movimiento-modal.tsx` pasa a ser **un solo buscador** sobre todo el árbol del usuario.
- Busca en los nombres de conceptos y categorías, y también en sus `palabras_clave`. Por ejemplo, si "Mercado" tiene la palabra clave "D1", escribir "d1" lo encuentra.
- Ignora tildes y mayúsculas, con la misma normalización que ya usa `Combo`.
- Cada resultado muestra su ruta para distinguir nombres parecidos, por ejemplo "Mercado · Familia › Costos fijos".
- Elegir un concepto completa su categoría y su centro con `rutaSeleccionada()`. Elegir una categoría completa el centro y deja el concepto vacío; esto importa porque hay usuarios con categorías y sin conceptos.
- Con el buscador vacío, muestra los conceptos que más ha usado el usuario recientemente (hasta 5).
- Si no hay resultados, ofrece "Crear concepto «texto escrito»". Como un concepto debe colgar de una categoría, en ese caso pide solo la categoría.
- La cascada actual se conserva como opción secundaria, por ejemplo detrás de un enlace "Elegir por centro y categoría".
- Conserva el comportamiento actual de los centros `estatico`.
- La búsqueda corre en el navegador sobre el árbol que ya se descarga. **No** agregues búsqueda en el servidor, ni `unaccent` ni `pg_trgm`: con árboles de 34 conceptos como máximo no hace falta.

#### 2.2 Conectar el sugeridor y el aprendizaje

- La ficha llama a `/categorization/suggest` cuando hay descripción o comercio (con espera breve entre teclas). Si la confianza supera el umbral actual, propone el concepto en el buscador, marcado como sugerido y editable.
- **Precedencia de fuentes**, de mayor a menor:
  1. Lo que el usuario elija a mano.
  2. El historial del propio usuario (el sugeridor).
  3. Las palabras clave del usuario.
  4. El diccionario del sistema (2.3).
     Una fuente inferior nunca reemplaza a una superior. Si unificar esto con el clasificador de recibos (`packages/lectura`) implica decisiones no evidentes, explícamelas en el reporte.
- Al guardar, si el usuario aceptó o corrigió una sugerencia, registra o actualiza la regla en `category_rules`, reutilizando el `upsert` que ya existe en `categorization.module.ts`. No aprendas de descripciones vacías o genéricas.
- Nunca guardes una clasificación sugerida sin que el usuario la vea en la ficha.

**Detente y repórtame**, incluyendo cuántas interacciones toma ahora registrar un gasto conocido.

---

#### 2.3 Palabras clave del sistema

**Decisión tomada:** el diccionario vive en el código, en `packages/lectura`, junto a `FIRMAS` y `RECAUDADORES`. No se crea tabla nueva y no cambia el esquema.

**Cómo funciona:** el diccionario no apunta a categorías ni conceptos, porque esos son de cada usuario. Apunta a **términos genéricos**, y esos términos se buscan en el árbol de cada usuario con el mismo buscador de 2.1.

Ejemplo: el texto de un recibo contiene "D1". El diccionario traduce "D1" a los términos "mercado", "supermercado" y "víveres". El buscador encuentra en el árbol del usuario el concepto "Mercado", por nombre o por palabra clave, y lo propone.

**Niveles de certeza del resultado:**

- **Alta:** los términos llevan a un solo concepto. Se propone el concepto.
- **Media:** llevan a una categoría pero a ningún concepto, o a varios conceptos. Se propone la categoría y el buscador queda abierto, filtrado con esas opciones.
- **Ninguna:** no llevan a nada. Los campos quedan vacíos y el buscador queda listo para escribir.

**Alcance:**

- Lo usa la lectura de recibos (foto o PDF) a través de `clasificar.ts`, respetando la precedencia de 2.2.
- Queda en `packages/lectura` porque en la fase 3 ese motor pasa a la API, y así lo hereda sin cambios.

**Antes de implementar, entrégame un borrador del diccionario** para revisarlo: comercios colombianos comunes agrupados por tipo de gasto (mercado, restaurantes y domicilios, transporte, combustible, peajes, farmacia, servicios públicos, telecomunicaciones, suscripciones digitales, salud, educación), cada grupo con sus términos genéricos. Marca cuáles ya estaban en `FIRMAS` o `RECAUDADORES`.

**Detente y espera mi revisión del borrador.**

---

#### Pruebas

**Buscador:**

- Encuentra por nombre y por palabra clave, sin importar tildes ni mayúsculas.
- Muestra la ruta de cada resultado.
- Completar desde un concepto llena categoría y centro.
- Elegir una categoría deja el concepto vacío.
- "Crear concepto" pide solo la categoría.

**Precedencia:**

- Una fuente inferior nunca reemplaza a una superior ni a la elección manual.

**Aprendizaje:**

- Aceptar o corregir una sugerencia crea o actualiza la regla.
- Una descripción vacía no crea reglas.

**Diccionario:**

- Términos que llevan a un concepto: certeza alta.
- Términos que llevan a una categoría o a varios conceptos: certeza media.
- Términos que no llevan a nada: sin propuesta.

#### Terminado cuando

- Pruebas, typecheck y lint pasan.
- En local, un gasto con clasificación completa se registra en cinco interacciones o menos, y en cuatro cuando la sugerencia acierta.
- Una foto de un recibo de un comercio del diccionario propone el concepto correcto en un usuario de prueba que tenga un concepto con ese nombre.
- No hay cambios de esquema ni nada desplegado.

**Detente y repórtame.**

---

### Fase 3: un solo cerebro en la API

**Problema:** la interpretación y la clasificación viven en `packages/lectura` y corren solo en el navegador. La API no clasifica, no sabe de dónde vino un gasto y descarta el texto leído. Una app externa no tiene a quién preguntarle.

**Objetivo:** que la API reciba texto o datos estructurados, devuelva el gasto interpretado con su clasificación y certeza, y lo registre de forma idempotente. La web usa el mismo motor.

#### 3.1 El motor en la API

- `packages/lectura` ya es un paquete del monorepo. La API lo importa tal cual; **no lo muevas ni lo dupliques**. Si tiene alguna dependencia del navegador, aíslala en el frontend y deja el paquete puro.
- El motor combina, con la precedencia de la fase 2: historial del usuario, palabras clave del usuario y diccionario del sistema.

#### 3.2 Modelo

Nuevas columnas en `transactions`, con migración solo local:

- `source`: enum con `web`, `ios_manual`, `ios_photo`, `wallet`, `sms`. Obligatoria; `web` por defecto para lo existente.
- `raw_text`: texto original del que salió el gasto (OCR, SMS). Anulable.
- `captured_at`: momento de la captura con zona horaria. Anulable.
- `por_revisar`: booleano, `false` por defecto. Marca los gastos que el sistema no pudo clasificar con certeza o que podrían estar duplicados.

Idempotencia: reutiliza `external_ref` y su índice único `(user_id, external_ref)`. Un cliente que reintenta manda el mismo `external_ref` y recibe el gasto ya creado con 200, no un error ni un duplicado.

Agrega todo al contrato compartido en `packages/types`.

#### 3.3 Endpoints

**`POST /transactions/interpret`** — sin efectos. Recibe texto libre (OCR o SMS) o datos estructurados (comercio, monto, fecha). Devuelve monto, fecha, comercio o descripción, clasificación propuesta con su nivel de certeza (alta, media, ninguna) y si necesita revisión.

**`POST /transactions/capture`** — interpreta, clasifica, detecta duplicados y crea en una sola petición. Recibe lo mismo que `interpret` más `source`, `external_ref` y `captured_at`. Devuelve el gasto creado, la clasificación y un resumen corto para mostrar como notificación, por ejemplo "Registrado: $45.000 · Alimentación" o "Pendiente de clasificar".

- Certeza alta: se guarda con la clasificación propuesta.
- Certeza media o ninguna: se guarda sin clasificar o con la categoría, y con `por_revisar = true`. **Nunca adivina.**
- Respeta el rate limit global.

**`POST /transactions`** (el actual) acepta las columnas nuevas y sigue funcionando igual para la web.

#### 3.4 Duplicados entre Wallet y SMS

Un pago con Apple Pay produce dos capturas: la transacción de Wallet y el SMS del banco.

- Al capturar desde `wallet` o `sms`, busca un gasto del mismo usuario con el mismo monto, misma fecha y origen distinto, capturado dentro de una ventana de pocos minutos (propón el valor).
- Si lo encuentra, **no crea otro ni borra nada**: enriquece el existente con lo que le falte (por ejemplo, el `raw_text` del SMS) y responde con ese gasto, indicando que fue fusionado.
- Si el parecido es parcial (mismo monto, pero otra fecha o fuera de la ventana), crea el gasto con `por_revisar = true`.

#### 3.5 La web usa el mismo motor

- El OCR sigue en el navegador (`tesseract.js`), pero el texto va a `/transactions/interpret` y la ficha se rellena con la respuesta. Así hay un solo lugar donde cambian las reglas.
- Al guardar, la web manda `source = web` y, si vino de un recibo, `raw_text`.

#### 3.6 Pruebas

- Idempotencia: dos `capture` con el mismo `external_ref` producen un solo gasto y la misma respuesta.
- Certeza: alta clasifica; media y ninguna marcan `por_revisar` y no adivinan.
- Duplicados: Wallet seguido de SMS fusiona; parecido parcial marca `por_revisar`; orígenes iguales no fusionan.
- `interpret` no escribe nada en la base.
- La web sigue registrando igual que antes.

#### Terminado cuando

- Pruebas, typecheck y lint pasan.
- En local, un texto tipo SMS bancario se convierte en un gasto clasificado en una sola petición, y el mismo texto repetido no crea un segundo gasto.
- La migración no está aplicada en producción.

**Detente y repórtame.**

---

### Fase 4: API lista para iOS

**Problema:** la sesión se renueva con una cookie `httpOnly; sameSite: strict`, pensada para el navegador. Una app nativa no puede mantenerla.

#### 4.1 Sesión para clientes nativos

- `POST /auth/login` y `POST /auth/refresh` aceptan una indicación explícita de cliente nativo (propón si por cabecera o por campo en el cuerpo). Para clientes nativos, el refresh token viaja **en el cuerpo de la respuesta** y se recibe en el cuerpo de la petición. Para la web, nada cambia: sigue la cookie.
- El refresh token rota en cada renovación, como hoy.
- `POST /auth/logout` funciona también con el token en el cuerpo.
- La revocación por `sessions_valid_from` sigue aplicando a los dos tipos de cliente.
- Los throttles de autenticación se mantienen.

#### 4.2 Autenticación de desarrollo

- Retoma la opción C de la fase 0: un segundo proyecto de Supabase solo para desarrollo. **Yo lo creo y te paso las claves**; tú lo conectas al entorno local. A partir de aquí, el entorno local no toca la autenticación de producción.

#### 4.3 Soportes desde iOS

- El endpoint actual de soportes (`POST /transactions/:id/soportes`) sirve tal cual. Documenta en `packages/types` o en un archivo de la API el contrato exacto que debe cumplir el cliente: tipos aceptados, límite por archivo y tamaño recomendado (el mismo que aplica la web: 1600 px de lado y JPEG de calidad 0,85).

#### 4.4 Pruebas

- Login, refresh con rotación, logout y revocación para cliente nativo, de punta a punta contra la base local. Es la primera prueba e2e del proyecto: deja la estructura lista para las siguientes.
- La web sigue autenticándose igual que antes.

**Detente y repórtame.**

---

### Fase 5: la app iOS

**Decisiones ya tomadas:**

- App nativa en Swift y SwiftUI, instalada desde Xcode con cuenta gratuita de Apple (certificado de 7 días). Sin App Store ni TestFlight por ahora.
- Enfoque **híbrido**, elegido por mantenibilidad (cada pantalla existe una sola vez, en la web). Lo nativo cubre lo que la web no puede hacer: captura, acciones para Atajos, cola sin conexión, OCR, notificaciones y accesos rápidos. Todo lo demás que muestra la webapp (dashboard, centros de costos, movimientos, soportes, cuenta, administración) se carga embebido dentro de la app, con una sola sesión. Ver 5.10.
- Toda la interpretación y clasificación ocurre en la API (fase 3).
- Las automatizaciones de Atajos llaman a **acciones de la app** (App Intents), no al endpoint directamente.
- El OCR de fotos ocurre **en el teléfono**, con Vision. A la API viaja el texto; la foto se sube después como soporte.
- Objetivo mínimo: iOS 17.

#### 5.1 Proyecto

- Proyecto de Xcode simple, sin dependencias externas salvo que haya una razón fuerte. Si necesitas una, propónmela antes.
- Configuración para firma con equipo personal (gratuito). Documenta en un `README` cómo instalar desde Xcode y cómo renovar cada 7 días.

#### 5.2 Sesión

- Login con correo y contraseña contra `/auth/login` como cliente nativo. Refresh token en el Keychain; access token en memoria.
- Renovación silenciosa cuando el access token caduca, también desde las acciones en segundo plano.

#### 5.3 Cola de capturas

- Toda captura se guarda primero en el teléfono, con un `external_ref` propio (UUID) generado en el momento de capturar, y después se envía a `/transactions/capture`.
- Sin conexión o si la API falla, la captura queda en cola y se reintenta con espera creciente. La app muestra cuántas capturas están pendientes.
- Una captura con foto envía primero el texto del OCR; cuando la API responde con el gasto creado, sube la foto como soporte.

#### 5.4 Acciones de la app (App Intents)

- **Registrar gasto de Wallet:** recibe comercio, monto, tarjeta y nombre, que son los campos que entrega el disparador "Transacción" de Atajos. Corre en segundo plano sin abrir la app. Si llega sin monto (el disparador a veces agota el tiempo de espera), captura igual con `por_revisar`.
- **Registrar gasto de SMS:** recibe el texto del mensaje y el remitente. Corre en segundo plano.
- **Registrar gasto manual:** abre el formulario rápido.
- Las tres aparecen como App Shortcuts, para que estén disponibles en Atajos, Siri y el botón de acción sin configurar nada.

#### 5.5 Registro manual rápido

- Formulario de una pantalla: monto, concepto, nota opcional y botón de cámara.
- El concepto se elige con un buscador sobre el árbol del usuario, con la misma lógica de la fase 2: busca por nombre y palabra clave, muestra la ruta y completa categoría y centro. El árbol se obtiene de `/categories` y se guarda en el teléfono.
- Cámara: la foto pasa por Vision, el texto va a la API y el formulario se rellena con la respuesta de `/transactions/interpret` antes de confirmar.
- Acceso rápido: control para el Centro de Control y la pantalla bloqueada en iOS 18 o superior; en iOS 17, widget de pantalla de inicio y botón de acción.

#### 5.6 Notificaciones locales

Solo locales. No hay push porque la cuenta gratuita no lo permite.

- Resultado de cada captura, con el resumen que devuelve la API.
- Cuando se envían capturas que estaban en cola.
- Un día antes de que caduque el certificado: la app lee la fecha de vencimiento del perfil de aprovisionamiento incluido en el paquete.

#### 5.7 Primer arranque

- Pantalla de bienvenida que explica, paso a paso, cómo crear las dos automatizaciones en Atajos (Transacción y Mensaje, cada una con "Ejecutar de inmediato"), con un botón que abre la app Atajos. La app no puede crearlas por sí misma.

#### 5.8 Puntos de parada

1. Proyecto creado, login funcionando contra el entorno local y una captura manual simple que llega a la API. **Detente.**
2. Cola de capturas con reintentos y las tres acciones de la app. **Detente.**
3. Formulario rápido con buscador y cámara, notificaciones y pantalla de bienvenida. **Detente.**

#### 5.9 Pruebas

- Unitarias: la cola (persistencia, reintentos, idempotencia del `external_ref`), la interpretación de parámetros de las acciones y el aviso de vencimiento.
- Lista de verificación manual que me entregas: crear las dos automatizaciones, pagar con Apple Pay, recibir un SMS del banco, registrar a mano con foto, probar sin conexión y recuperar al volver la señal.

#### 5.10 Vistas embebidas (WKWebView)

- Todo lo que hoy muestra la webapp y no es nativo se carga dentro de la app: dashboard, centros de costos, movimientos, soportes, cuenta y administración.
- **Una sola sesión:** la app inicia sesión una vez y el webview la recibe. Nunca un segundo login. El mecanismo se diseña con la API de la fase 4 y se anota en el registro; nunca se pasan tokens en la URL.
- Navegación nativa (barra inferior o pestañas) que mezcla pantallas nativas y vistas web sin que se note el cambio.
- Si el webview pierde la sesión, la app la renueva sola.
- Sin conexión, el webview muestra un estado claro; la captura nativa sigue funcionando por la cola.
- Si la web necesita ajustes para verse bien embebida (por ejemplo, ocultar su propia barra de navegación), se hacen en el frontend detectando que corre dentro de la app, sin afectar la web normal.
- La fase se hace completa sin el iPhone: proyecto, código, pruebas, compilación y ejecución en el simulador, y el README de instalación y renovación cada 7 días. La única acción del usuario es conectar el teléfono e instalar, como último punto del informe.
