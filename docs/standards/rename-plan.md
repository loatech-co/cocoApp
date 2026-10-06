# Rename plan (step 7.2)

How to take what is still in Spanish to English without breaking anything, in steps that fit one
executor each and do not step on each other. The names themselves are in
[`rename-map.json`](rename-map.json) (version 2); this document is the order and the rules.

**Base.** `origin/Dev` at `167d3f3` (the v2 contract, #36, is already merged). Read with it: iOS
#29 (`feat/ios-localizable`, all iOS identifiers in English, ADR 0021) and #39 (iOS on
`/api/v2`). `feat/web-api-v2` (the web on v2) **was not pushed** when the map was made, so the
web still speaks v1 and its wire fields wait for it.

## What is left

| Category                                                 |                                                    Count | Breaks?                                                                            |
| -------------------------------------------------------- | -------------------------------------------------------: | ---------------------------------------------------------------------------------- |
| Directories                                              |                                                        7 | no                                                                                 |
| Files                                                    |      204 (api 40, frontend 139, packages 12, scripts 13) | no                                                                                 |
| Identifiers, exported                                    |      531 (api 179, frontend 271, packages 72, scripts 9) | no                                                                                 |
| Identifiers, not exported                                | 2358 (api 845, frontend 1305, packages 106, scripts 102) | no                                                                                 |
| Properties, internal (keys, members, DTO fields)         |                                                      947 | no                                                                                 |
| Properties on the wire (v1 JSON or a DB column)          | 245 (api 134, frontend 69, packages/types 35, scripts 7) | yes: v2 already sends the English name                                             |
| Test titles (`describe`/`it`)                            |                                             1038 of 1503 | no                                                                                 |
| Comments                                                 |                                             3069 of 3800 | no                                                                                 |
| Database: tables / columns / enum types / enum values    |                                          2 / 17 / 12 / 5 | no: English in the Prisma client with `@map` (7.2-c), the database keeps its names |
| Database: constraints and indexes                        |                              8 Spanish, 63 by convention | no (`RENAME`)                                                                      |
| Database: data values (`pref_key`)                       |                                                        1 | yes                                                                                |
| Prisma-only names (model, relations, fields with `@map`) |                                                 7 groups | no                                                                                 |
| Applied migration folders with Spanish names             |                                                       12 | kept forever                                                                       |
| API routes, headers, JSON fields, JSON values            |                                         12 / 1 / 90 / 21 | done in v2; v1 stays until 7.10                                                    |
| Web routes / query params and values                     |                                                   8 / 12 | yes (bookmarks, iOS links)                                                         |
| Browser storage                                          |                                    1 (`sidenav-plegada`) | yes                                                                                |
| Web ↔ iOS bridge                                         |                                                       12 | yes (two processes)                                                                |
| Environment variables                                    |                                          5 + 1 test-only | yes                                                                                |
| npm scripts / `scripts/` files                           |                                                   6 / 13 | no (docs and `package.json`)                                                       |
| Infrastructure (bucket, server folder)                   |                                                        2 | no: both stay (the code reads `RECEIPTS_BUCKET`, default `soportes`)               |

Identifiers and properties are counted per slice (a name declared in two folders is two
entries, one per owner). Of the 2889 identifiers, 470 keep the hand-corrected name of the first map (`"source":
"map-v1"`). The rest were composed from the glossary in the map (`"review": true`): the slice
that renames them reads each one before applying it, the same rule as the first map.

## Rules for every slice

1. **One slice = one folder.** The `slice` key of the map is the owner. A slice renames what is
   DEFINED in its folder and fixes every use site, wherever it is (a rename through the TypeScript
   language service, never a text replace). That is why slices run **in sequence inside a lane**:
   two slices in parallel would both edit the import lines of a third.
2. **Two lanes may run in parallel**: the api lane (`api/`) and the web lane (`frontend/`). They
   only meet in `packages/`, which goes first, and in the bridge and web routes, which go last.
3. **Names first, prose second.** Each slice is two executors: **N** (directories, files,
   identifiers, internal properties) and then **P** (comments and test titles of the same
   folder). Prose is a third of the work and needs the new names to read right.
4. **Nothing that breaks goes into an N or P step.** Wire properties, routes, storage keys, env
   vars, the bridge and the database stay as they are; they have their own steps below.
5. Each slice ends removing its names from the lint baseline (7.2-a): the lint is what proves the
   slice is done.
6. Leave alone: applied migrations, `api/src/contract/v2/to-v2.ts` (its keys ARE the v1 names),
   v1 DTO and view fields marked `breaking: true`, user-visible Spanish text (that is 7.3), and
   `ios/` (#29).

## Prerequisites

Rebase on, or wait for, the open PRs that touch the same folders. Each rename slice turns any
open PR on its folder into a conflict.

| Lane              | Wait for                                                                              |
| ----------------- | ------------------------------------------------------------------------------------- |
| api               | #31 (RLS), #35 (Prisma 7), #38 (health probes v2), #22 (feature flags), #27 (budgets) |
| web               | #37 (web-c, moves files in `shared/ui`), #40, #34, #27, #22, and `feat/web-api-v2`    |
| iOS side of r1/r2 | #21, #28, #29, #39                                                                    |

`feat/web-api-v2` matters most: it rewrites `shared/api`, drops `packages/types` and turns the
wire properties of `frontend/` into English ones. The web slices start after it.

## Sub-steps, in order

Counts are from the map: ids = identifiers, props = internal properties.

| Step       | Lane         | Folder (slice)                                                                                   | ids | props | files | titles | comments | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------- | ------------ | ------------------------------------------------------------------------------------------------ | --: | ----: | ----: | -----: | -------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **7.2-a**  | both         | lint + baseline                                                                                  |   — |     — |     — |      — |        — | Must go first. See "The lint" below. Done                                                                                                                                                                                                                                                                                                                                                                                             |
| **7.2-b**  | both         | `packages/lectura` → `packages/receipt-parser`                                                   | 153 |    79 |    12 |     14 |       88 | Package `@coco/lectura` → `@coco/receipt-parser`; imports in api and frontend; root `postinstall`. Done (`monto.ts` is `amount.ts`, not the map's `amount-display.ts`)                                                                                                                                                                                                                                                                |
| **7.2-c**  | api          | Prisma client names                                                                              |   — |     — |     — |      — |        — | Every Spanish name of the schema goes to English in the CLIENT only, with `@map("<old>")`/`@@map("<old>")`: `Soporte` → `Receipt` (`@@map("soportes")`), the 14 Spanish columns, `audit_log` (`@@map`), `Periodicidad` → `Periodicity` with its 5 values (`@map` per value, `@@map("Periodicidad")`), relation names. **No migration, SQL unchanged.** Touches every module that uses them, so it goes before the module slices. Done |
| **7.2-d**  | api          | `api/src/{common,contract,prisma}` + `modules/{auth,accounts,admin,tags,spa,health,preferences}` | 302 |    46 |     4 |    141 |      296 | `entorno.ts` → `env.ts`; v1 response CLASS names rename, their fields do not                                                                                                                                                                                                                                                                                                                                                          |
| **7.2-e**  | api          | `modules/{categories,categorization,transactions}`                                               | 220 |    14 |     6 |     71 |      223 |                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **7.2-f**  | api          | `modules/dashboard`                                                                              | 151 |    30 |     3 |     82 |      114 |                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **7.2-g**  | api          | `modules/interpretacion` → `interpretation`, `modules/soportes` → `receipts`                     | 193 |    26 |    21 |     61 |      135 | `soportes.contrato.spec.ts` reads a frontend file by path                                                                                                                                                                                                                                                                                                                                                                             |
| **7.2-h**  | api          | `api/test`                                                                                       | 158 |    23 |     6 |    196 |       92 | After d–g: e2e helpers use their names                                                                                                                                                                                                                                                                                                                                                                                                |
| **7.2-i**  | api          | `scripts/` + root npm scripts                                                                    | 111 |    45 |    13 |      — |      111 | `scripts/soportes` → `scripts/receipts`; 6 npm scripts. Consumers: `package.json`, README, `scripts/desplegar-migraciones.sh`, docs                                                                                                                                                                                                                                                                                                   |
| **7.2-j**  | web          | `shared/ui/atoms`                                                                                | 190 |    67 |    43 |     77 |      283 | Design tests read source by path (`button.llamadas.test.ts`, `radio.test.ts`, `foco.test.ts`…). N done (`panel-inferior` is `bottom-sheet`, `chip-icono` is `icon-chip`); P pending                                                                                                                                                                                                                                                   |
| **7.2-k**  | web          | `shared/ui/{molecules,organisms,foundations}` + loose `shared/ui` tests                          | 114 |    57 |    19 |     38 |      274 | `CLAUDE.md` names these files: the owner decides when it changes                                                                                                                                                                                                                                                                                                                                                                      |
| **7.2-l**  | web          | `shared/lib` + `shared/api` + `src` root + `src/pruebas` + `assets-fuente`                       | 329 |   106 |    24 |    112 |      279 | The bridge NAMES stay (7.2-r2); the functions around them rename                                                                                                                                                                                                                                                                                                                                                                      |
| **7.2-m**  | web          | `features/transactions/components`                                                               | 275 |   184 |    17 |     69 |      437 | The biggest one. If it does not fit, split by file name A–M / N–Z                                                                                                                                                                                                                                                                                                                                                                     |
| **7.2-n**  | web          | `features/transactions/{api,hooks,model,pages}`                                                  | 254 |    71 |    13 |     81 |      199 | Filter query params stay (7.2-r1)                                                                                                                                                                                                                                                                                                                                                                                                     |
| **7.2-o**  | web          | `features/centros` → `features/cost-centers`                                                     | 169 |    81 |    12 |     50 |      148 |                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **7.2-p**  | web          | `app` + `features/{admin,auth,bank-accounts,profile}`                                            | 245 |   123 |    11 |     46 |      299 | Route paths stay (7.2-r1)                                                                                                                                                                                                                                                                                                                                                                                                             |
| **7.2-r1** | web + iOS    | web URLs and storage                                                                             |     |       |       |        |          | Expand: see the table below                                                                                                                                                                                                                                                                                                                                                                                                           |
| **7.2-r2** | web + iOS    | bridge                                                                                           |     |       |       |        |          | Coordinated, see below                                                                                                                                                                                                                                                                                                                                                                                                                |
| **7.2-r3** | api + server | environment variables                                                                            |     |       |       |        |          | Expand. Includes `RECEIPTS_BUCKET` (default `soportes`, the bucket does not move)                                                                                                                                                                                                                                                                                                                                                     |
| **7.2-r5** | api + DB     | database, conventions                                                                            |     |       |       |        |          | Constraint and index renames (`ALTER … RENAME`, no data moves) and the missing `updated_at` (additive). `timestamptz` is phase 8 (ADR)                                                                                                                                                                                                                                                                                                |
| **7.10**   | all          | contract                                                                                         |     |       |       |        |          | One stop at the end of the phase                                                                                                                                                                                                                                                                                                                                                                                                      |

Every row from b to p is an **N** step followed by its **P** step (7.2-d-N, 7.2-d-P…). The two
lanes: api = b → c → d → e → f → g → h → i; web = b → j → k → l → m → n → o → p. Then r1, r2, r3
and r5 in any order (r1 and r2 after p; r5 after c). There is no r4: the database keeps its Spanish
names behind `@map` (owner, 5 Oct 2026). 7.10 last.

## What breaks, and how it goes

| Item                                                                                     | Strategy                 | How                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| v1 routes, header, JSON fields and values                                                | **v2, done**             | Contract in 7.10: v1 goes once web and iOS are on v2 and the v1 counter has been at zero for one hour (owner, 5 Oct 2026). Then the services' views lose their v1 keys and `to-v2.ts` disappears                                    |
| Wire properties in `api/` (134, with the keys of `to-v2.ts` and the v1 response classes) | with v1                  | They are the v1 view the services return; they rename when v1 goes                                                                                                                                                                  |
| Wire properties in `frontend/` (69) and `packages/types` (35)                            | `feat/web-api-v2`        | The web on v2 reads English fields; `@coco/types` (25 identifiers, 88 comments) is replaced by the generated client, not renamed. Some frontend keys only share the name of a v1 field: the slice checks and renames those directly |
| Script properties that are column names (7)                                              | stay                     | `scripts/cargar-historico.mjs` and `sembrar-local.mjs` write SQL columns, and the columns keep their names: these keys stay, as SQL. Their identifiers rename in 7.2-i                                                              |
| Web routes (8)                                                                           | expand-contract          | New route + `<Navigate replace>` from the old one. iOS links three of them (`/centros-de-costos`, `/mi-cuenta`, `/administracion`) and changes in the same step. Redirects go in 7.10                                               |
| Filter query params (5) and range values (7)                                             | expand-contract          | Read both, write the new one                                                                                                                                                                                                        |
| `localStorage` `sidenav-plegada` = `si`/`no`                                             | expand-contract          | Read the old key once, write `sidenav-collapsed` = `true`/`false`, remove the old                                                                                                                                                   |
| Bridge (12 names)                                                                        | **coordinated, direct**  | No app is installed (ADR 0021), so there is no old client to keep alive: web and iOS change in one step and ship together                                                                                                           |
| Env vars `SOPORTES_*`, `PERMITIR_*` (5)                                                  | expand-contract          | The zod schema accepts the new name and falls back to the old one with a warning; the new one is set on the server (additive). Removing the old from the server is 7.10 (stop)                                                      |
| Columns (14 Spanish), table `soportes`, `audit_log`                                      | **`@map`, no DB change** | English field and model names in the Prisma client, `@map`/`@@map` to the old SQL name (7.2-c). Nothing moves in production; raw SQL keeps the SQL names                                                                            |
| `Periodicidad` type and its 5 values                                                     | **`@map`, no DB change** | `enum Periodicity { monthly @map("mensual") … @@map("Periodicidad") }` (7.2-c). The CHECK `ck_categories_payment_month_not_monthly` is untouched                                                                                    |
| `user_preferences.pref_key = 'cuentas_habilitadas'`                                      | expand-contract          | The service reads both keys and writes the new one; 7.10 rewrites the leftovers                                                                                                                                                     |
| Constraint and index names (8 Spanish + 63 convention)                                   | direct (7.2-r5)          | `ALTER … RENAME`, no data moves; only the Prisma schema `map:` reads the name                                                                                                                                                       |
| Missing `updated_at` (13)                                                                | additive (7.2-r5)        | New column with a default; nothing reads it before the code that writes it                                                                                                                                                          |
| `timestamp(3)` → `timestamptz(3)` (14)                                                   | **phase 8**              | Postponed with an ADR: a type change on every table is not a naming step, and the values are UTC already                                                                                                                            |
| English-valued enum TYPE names (`AccountType` → `account_type`, 11)                      | **stay**                 | Prisma casts parameters with the type name, so renaming it breaks the running code. The names stay; only `Periodicidad` gets an English name, in the client (`@@map`)                                                               |
| Bucket `soportes`, server folder `soportes-cocoapp`                                      | **stay**                 | The code reads `RECEIPTS_BUCKET` (7.2-r3), default `soportes`. The server folder is deleted in 7.10                                                                                                                                 |
| Applied migration folders (12)                                                           | never                    | Prisma stores each name in `_prisma_migrations`; a renamed folder is a new migration. `migraciones-mysql-archivadas` is not read by Prisma and renames directly in 7.2-c                                                            |

**r5** (conventions) is one executor: constraint and index renames and `updated_at`. There is
no r4 (owner, 5 Oct 2026): the database keeps its Spanish names, and the code reads them through
`@map` from 7.2-c on.

## Outside the code

These name renamed paths and must follow each slice, or the slice leaves them stale:
`CLAUDE.md` (the owner decides when; it is the UI rulebook), `.claude/rules/web.md`,
`CONTRIBUTING.md`, `README.md`, `ios/README.md` and `ios/CocoTests/IndiceDelArbolTests.swift`
(they cite a frontend test path), `docs/runbook.md` once it exists (#19), and the design tests
that read source files by path.

## The lint (`scripts/lint/spanish-identifiers.ts`)

What it checks: every identifier declared in TS/JS under `api/`, `frontend/`, `packages/` and
`scripts/`, and every file and folder name there. A name is split into words (camelCase,
snake_case, kebab-case), accents are stripped (`categoría` → `categoria`), and the name fails if
any word is in the list. Strings and comments are not checked by this script (comments are a
review item; visible text is 7.3).

**What 7.2-a built.** The lint also reads `e2e/` and the Swift of `ios/` (declarations, enum
cases and parameter labels; strings and comments out). Declared names are variables, parameters,
functions, classes, types, members, object keys and import aliases; a plain import is a use, not a
declaration.

**Baseline.** `scripts/lint/spanish-identifiers.baseline.json`, generated from a SCAN of the code
at 7.2-a (not from this map, which is older than several merged PRs): per folder, each Spanish
name with its count. More of a name in a folder fails; fewer fails too until
`npm run lint:spanish -- --update` shrinks the file, so the baseline always says exactly what is
left. CI (`verify`) adds `--against <base sha>`: the baseline may move between folders (a slice
renames one) but no name may grow. Each slice ends with its folders gone from the file; 7.10
deletes it. At 7.2-a: 9324 names in 81 folders.

**ESLint's half.** `@typescript-eslint/naming-convention` and `eslint-plugin-check-file` arrive in
`error`, with ESLint's own bulk suppressions as their baseline (`<workspace>/eslint-suppressions.json`,
424 cases, nearly all booleans without `is`/`has`…). Every N step prunes its folder there too
(`--prune-suppressions`); the last N step of each lane (7.2-i for api and packages, 7.2-p for the
web) deletes the file. CONTRIBUTING.md «Naming» has the commands.

**Exceptions** (permanent, each with its reason in the script):

| Exception                                                                                                                                                                                                              | Why                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `el`, `es`, `en`                                                                                                                                                                                                       | `el` is the usual name for a DOM element; `es` and `en` are locale codes (`es.json`) |
| English words that are also Spanish: `son`, `lo`, `may`, `pie`, `combo`, `total`, `final`, `real`, `normal`, `general`, `actual`, `panel`, `chip`, `control`, `selector`, `alias`, `variables`, `demo`, `configurable` | Not in the list; listed here so nobody adds them                                     |
| Proper nouns and codes: `bogota`, `celsia`, `nit`, `cop`, `beto`, `ana`, `bruno`                                                                                                                                       | Places, brands, the Colombian tax id, the currency, test personas                    |
| `api/prisma/migrations/**`                                                                                                                                                                                             | Applied names, never renamed                                                         |
| `api/src/contract/v2/to-v2.ts` and the `breaking: true` properties of the map                                                                                                                                          | They are the v1 contract; they go with v1 in 7.10                                    |
| `frontend/src/locales/**`                                                                                                                                                                                              | User-visible text (7.3)                                                              |
| Added in 7.2-a: `ago`, `feb`, `mar`, `jun`, `jul`, `sep`, `sept`, `oct`, `nov`, `solo`, `persona`, `vista`, `pico`, `fin`, `peso`, `pesos`                                                                             | English too (month abbreviations, borrowed words); taken out of the list below       |

**Words** (1165, from the code at the base commit; the script adds new ones as they appear in
review):

```text
abajo abierta abierto abiertos abonando abr abre abril abrir absoluto acabar accion acciones acento
aceptados aceptar acreedor activa activas activo activos actualizada actualizado actualizar
acumulado acumular adentro adeudado adjuntar administracion admite afectadas afuera agarre agosto
agregable agregados agregar agrupada agrupado agrupados agrupar agua aguja ahora ajena ajeno
ajustado ajuste ajustes al algo algun alimentacion alineado almacen alquiler alta alternar
alternativas alto altura alturas ambiguos anadir ancestro ancho ancla anclaje anfitrion angulo
anidar anillo anio anoche anotar antecedente anterior antes anual anunciar aparatos aparece
apertura aplicar aprender aprendida aprendido aprendio aprobacion aprobado aprobar apuntar arbol
archivadas archivado archivar archivo archivos arco arcos argumentos armar arrancar arranque
arrastrada arrastrando arrastre arreglando arriba ascendente asegurar aseo atajo atajos atencion
atenuada atrapado atras auditada auditado automatico automaticos autorizacion avance avisar aviso
avisos ayuda bajado bajar bajo baldosa baldosas banco bandera barra biblioteca bimestral binario
bitacora bloque bloqueado bloques bonito borra borrado borrador borrando borrar boton bruto busca
buscable buscada buscado buscador buscando buscar busqueda cabe cabecera cabeceras cabeza cada
cadena caja calcular calendario calidad camara cambiado cambiar cambio cambios camino campo campos
cancelar candado candidata candidatas candidato candidatos capa captura capturada capturar capturas
cara caracter cargando cargar carpeta casados cascada casilla categoria categorias causa celda
celdas centro centros cerca cero cerrada cerrar certeza ciclo cierre cifra cifras claro clase
clases clasificacion clasificar clave claves cliente cobrar cobro codigo coherencia coherente
coinciden coincidencias columna columnas comas combinar comercio comercios comilla comillas como
compacto compara comparables completa completar comportamiento comun comunes con concepto conceptos
condicion confianza configuracion confirmacion confirmando confirmar congelar conocida consulta
contador contar contenido contenidos conteo contesta contexto contorno contrasena contrato
controlador copias correcta correo correr corrupta corrupto corte corto cortos costo costos
creacion creada creadas creado creados creando crear crece credito cruce cruda crudo cruza cuadra
cuadre cuando cuantas cuantos cubo cubos cubrir cuenta cuentas cuerpo culpables cumple cupo curso
curva dato datos de decidir declarada decodifica decodificar defecto defectos dejar del dentro
derecha deriva derivado derivados desborde descargar descartada descartar descartes descendente
descendiente descendientes descripcion desde desentrecomillar desfasado desglose deshabilitada
deshabilitado deshacer deslizar desplazable desplazamiento desplazarse desplegar despues destino
destinos destructiva detalle detalles deudas devuelve dia dias dibujo dic diccionario dicho
diciembre diferencia dijo dinero direccion disparador disponible disponibles dispositivos distancia
distribucion documento domicilios dominio dona donde dos duplicado duplicados duplican duracion
editando editar eje ejemplo elegida elegido elegir elemento eligiendo eliminada eliminadas eliminar
embebida emisor emitido emitir emparejar empatada empezar empezo encendido encima encoger
encontradas encontrados encontrar encuadre ene energia enero enfocables enfocados enlaces
enriquecer ensayo entero enteros entorno entra entrada entradas entrar entre entregar enviado
enviando enviar equis equivalencia escala escaneando escanear escapar escribir escrita escrito
escritorio espera esperado esperando esqueleto esquema esta estaba estaban estabilizada estado
estados estatico este estilo estilos estimado estira esto etapa etiqueta etiquetas evalua evaluar
evento eventos exacto excepciones excepto excluido excluye exigir existe existente expira expirar
explicacion extraer extremo extremos falla fallo fallos falsa falso falta faltando faltantes
febrero fecha fechas ficha fija fijos fila filas filtraciones filtradas filtrado filtrados
filtrando filtro filtros fingir firma firmas flecha flotante flujo foco fondo forma formato
formulario forzar fraccion fragmento fragmentos fuente fuentes fuera fusionada fusionado ganadora
gastado gasto gastos gemela gemelo generaria genericas gesto gimnasio glifo glifos grafica grande
granularidad grosor grupo grupos guardadas guardado guardando guardar guardia guias habilitadas
hacia hallada hallado hallados hasta hay haya hecho hechos hermanos herramienta hijo hijos historia
historial historico hogar hoja hojas hola hondo hoy hubo hueco huella huerfano huerfanos icono
iconos idas idioma ignorados iguales ilegibles imagen impedimento importar incluir indeterminado
indexar indice inferior ingreso ingresos inicial iniciales inicio instalar instantanea intento
interacciones interpretacion interpretada interpretado interpretar interruptor invalidar invasores
inventada ir izquierda julio junio juntas junto la lado larga largo largos las lectura leer leida
leido lejana levantan levantar libre lienzo limitador limite limpia limpiar limpias limpio linea
lineas lista listado listar listas listo llamada llamadas llamado llamar llaves llega llego llena
lleno lleva llevan longitud los luz mandos manos mantener mantuvo mapa marca marcado marcados
margen marzo mas maxima maximo mayo mayuscula medida medidas medir mejor mensaje mensajes mensual
mercado mes meses metodo mezclado mi mientras miles minima minimo mismo modo momento montar monto
montos mostrado mostrar motivo motivos motor mov mover movido movidos movil movimiento movimientos
muchas nacen nada nativo navegacion navegador navegar necesita negativo neutro nieto nietos nivel
niveles nodo nodos nombrar nombre nombres normalizada normalizadas normalizado normalizar nota
notas noviembre nucleo nueva nuevo nuevos numero numeros objetivo observador obtener octubre oculto
ocultos ocupada ocupado olvidadizo olvidar olvido opcion opcionales opciones optimizacion
optimizado optimizar orden ordenable ordenadas ordenados ordenes origen origenes oscuro otra otro
otros oyente oyentes padre pagado pagados pagina paginacion paginador paginas pago pagos palabra
palabras paleta panico para parametros parcial parte partir pasado pase pasivo paso pasos pastilla
pata patas patron pedazos pedida pedidas pedir pegar peligro peligrosa pendiente pendientes pequeno
perdidos perfil periodicidad periodicidades periodo permiso permitidos permitir peticion pila
pincel pinta pintado pintando pintar piso pista plana planas planilla plantilla plata plegada
politica poner por porcentaje porcion porciones portapapeles posible posibles posicion positivo
precedencia preferencia preferencias prefijo prefijos preocupante preocupantes preparar presentar
presupuesto previa previo primer primera primero prioridad problema problemas proceso produccion
profundidad programar progreso prohibidas promedio promesa pronto propia propias propio proponer
proponiendo propuesta proyectado prueba pruebas publica publico pudo puede puente puestas puesto
pulsacion pulsar puntaje puntajes puntero punto puntos puntuadas puntuar que queda quede quehacer
quinto quitar raices raiz rama ramas rango rasgo razon reaccionar reactivar realce reales
reasignados reasignando reasignar recaudadores rechazadas rechazar rechazo recibida recibir recibo
recien recientes reclasificar recomendado reconocer reconocido reconocimiento recorrer recorrido
recortar recurrencia recurrente recursos referencia refrescar refrescos registrado registrar
registrarse registro regla reglas reintentar rejilla relativa relleno reloj relojes remota renglon
renombrando renovacion renovada renovar reordenar repetida repetido repetidos reporte requerido
requeridos requiere requisito requisitos resolucion resolver resplandor responder respuesta
restablecer restableciendo restante restaurar resto resuelto resultado resultados resultante
resumen reuso reventar revisar revocar rol rotado ruido ruta rutas saldo saldos salida salidas
salir saneado se seccion secciones seg segmentos seguir segunda segundo segura seguridad seguro
seleccionada sello sembrada sembrar semestral senal senalado separador septiembre serializar serie
servicio servicios servidor sesion sesiones setiembre si significativos signo sigue siguiente
silencio sin sitio sobre sobrevolado sobrevolar solicitud soltando soltar sonda soporte soportes
soy subarbol subcategorias subida subido subiendo subir subtitulo suelto sufijo sugerencia sugerir
suma sumar superficie suscribir suscribirse suspender suya suyas suyo suyos tabla tactil tam tamano
tamanos tanda tarde tarjeta techo teclado teclear temporizador tendencia tercero terminar termino
terminos texto textos tiempo tiene tildes tinta tipo tipografia tipos tirador titulo toca tocar
todas todoslos tomar tono tope toque trabajo tramo tramos transaccion transferencia transferencias
transporte tras tratar trazos treinta tres trimestral trozo tuberia tuberias ubicacion ultima
ultimo umbral un una unica unico unicos unificar unir uno usa uso usos usuario usuarios util vacia
vaciar vacias vacio valida validar valor variante varias varios ve veces velo vence vencido
vencimiento ventana ver verdad veredicto verificar victima viejo viendo vinculo visibles visitados
visitar visitas vistas vistos vivas vivienda vivo vivos volcado volver vuelo vuelta vuelve yo
```

## Decisiones (5 oct 2026)

Instrucción del dueño, tras la revisión externa: **«7.2 usa `@map` en Prisma; el código queda en
inglés sin mover columnas en producción».** Lo que se sigue de ella, decidido por el director, y
que reemplaza las decisiones anteriores del mismo día (ADR 0026, `docs/adr/0026-database-names-stay-behind-prisma-map.md`):

1. **No hay r4.** Los 14 campos en español, `Soporte` → `Receipt`, `audit_log` y `Periodicidad`
   pasan a inglés solo en el cliente de Prisma, con `@map`/`@@map` (7.2-c). La base no cambia.
2. **El bucket `soportes` y los nombres de los tipos enum de la base se quedan.** El código lee
   `RECEIPTS_BUCKET` (por defecto, `soportes`).
3. **r5 se reduce** a renombrar restricciones e índices (`ALTER … RENAME`, sin mover datos) y a
   añadir `updated_at` donde falte (aditivo). La conversión a `timestamptz` se pospone, con un ADR,
   a la fase 8.
4. **La v1 se retira cuando su contador pase una hora en cero** con la web y iOS ya en la v2
   (decisión del dueño; sustituye a los «siete días»).
5. **`CLAUDE.md` se pone al día con los nombres nuevos en 7.14**, y la carpeta del servidor
   `soportes-cocoapp` se borra en la contracción de 7.10, no antes.
