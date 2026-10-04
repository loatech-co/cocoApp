# Registro del modo autónomo

Bitácora operativa de la ejecución autónoma del plan (fases 2 a 6 y lo que
quedaba del paso intermedio), empezada el 4 de octubre de 2026 a las 11:58
(Bogotá). Se escribe mientras se trabaja; el informe final se deriva de aquí.

Convenciones: horas en America/Bogota; los commits se nombran por su hash
corto; «producción» es el proceso de Hostinger que despliega desde `Dev`.

---

## 0. Estado al empezar

| Qué | Dónde |
|---|---|
| Producción (`Dev` en el servidor) | `ba3e636` — proceso vivo desde hace 4 días |
| Ramas de trabajo, en línea recta sobre `Dev` | `fase-0-base-segura` → `fase-1-varios-pagos` → `paso-react-hooks` (`9616997`) |
| Base de producción | 13 migraciones; **sin** `categories.varios_pagos` |
| Base local | 14 migraciones; con `varios_pagos` |

Regla operativa derivada de la fase 0: `Dev` **es** la rama que Hostinger
despliega (`+refs/heads/Dev`). Integrar en `Dev` equivale a desplegar. Por eso
el orden fijo es **migración → verificación → merge → push**, nunca código
antes que esquema.

---

## 1. Cierre del paso intermedio (`paso-react-hooks` → `Dev`)

### 1a. Migración — APLICADA · 11:53

El script `scripts/desplegar-migraciones.sh` es interactivo (pide `si`).
Pasarle el `si` con un `echo` destruiría justamente la compuerta, así que se
separaron sus tres pasos y la compuerta se hizo **programática**: se corre
`prisma migrate status`, se parsea la lista de pendientes, y solo si es
exactamente `['20261004110905_varios_pagos_en_conceptos']` sin fallidas se
corre `migrate deploy` y después `cerrar-el-api-de-datos.sql`.

Resultado del `status`: 14 migraciones, **una** pendiente, la esperada.
Compuerta abierta.

SQL aplicado, textual:

```sql
ALTER TABLE "categories" ADD COLUMN "varios_pagos" BOOLEAN NOT NULL DEFAULT false;
```

`migrate deploy`: «All migrations have been successfully applied».
`cerrar-el-api-de-datos.sql`: 0 tablas sin RLS, 0 políticas, 0 permisos
abiertos (idempotente; no había tabla nueva que cerrar).

### 1b. Verificación — EN CURSO

| Comprobación | Resultado |
|---|---|
| `information_schema.columns` para `varios_pagos` | `boolean · default false · NOT NULL` ✅ |
| `_prisma_migrations`, últimas 3 | `varios_pagos_en_conceptos` arriba, aplicada 11:53:54; debajo `pago_automatico` y `presupuesto_en_concepto` ✅ |
| HTTP producción (código viejo) — `/api/v1/health` | 401 antes y después (es un endpoint autenticado; 401 = proceso vivo) ✅ |
| HTTP producción — `POST /auth/login` con correo inexistente | 401 antes y después (un 500 sería la base rota) ✅ |
| `stderr.log` de la API en el servidor | sin una línea nueva desde el 18-sep; 0 errores de Prisma/columna ✅ |
| Producción bajo el incidente de SSH (12:05): `health` ×2, `login` bogus, portada | 401 · 401 · 401 · 0,32 s — **la app no está degradada**; la cuota agotada afecta a mis sesiones, no al proceso ✅ |
| Lectura **y escritura** de `categories` con el cliente Prisma de `ba3e636` contra una base que ya tiene `varios_pagos` | ✅ ver abajo |

**Sustitución declarada.** El plan pedía probar «contra la API de producción
que el resumen y las categorías respondan bien». Esos endpoints exigen un
JWT de Supabase que no tengo ni debo fabricar (crear una sesión sería
escribir en la autenticación de producción). Y la variante «en el servidor
con el cliente desplegado» quedó bloqueada por el incidente de SSH. Se hizo
entonces la prueba **equivalente en local, con fidelidad total a la capa que
importa**: se generó el cliente Prisma a partir del `schema.prisma` de
`ba3e636` (sin `variosPagos`, Prisma 6.19.3 —la misma versión que despliega
hbuilds—) a un directorio aparte, y se ejecutó contra la base local, que ya
tiene la columna. El host de la base es irrelevante para la interacción
cliente↔columna, que es lo que se está probando.

Resultado:

```
categorias: 30
select_del_resumen (el de ba3e636):   3 filas, 10 campos
findFirst sin select:                 fila devuelta, 18 campos, trae_variosPagos = false
INSERT con el cliente viejo:          ok; la base puso varios_pagos = false (DEFAULT)
                                      → deshecho dentro de la transacción (0 filas quedan)
```

Y el contraste con el cliente **nuevo** contra la misma base: `findFirst`
trae `variosPagos`; 1 concepto marcado. Los dos clientes conviven con la
misma columna: el viejo no la ve, el nuevo sí. Es exactamente la ventana en
la que está producción desde las 11:53, y es segura en ambos sentidos.

Incidentes del camino, en la sección 3.

### 1c. Merge fast-forward y push — PENDIENTE

Precondiciones ya comprobadas: árbol limpio; `origin/Dev` = `Dev` local =
`ba3e636` (no se movió); `paso-react-hooks` (`9616997`) es descendiente
directo → fast-forward de 4 commits:

```
9616997 refactor: los 26 errores de react-hooks, resueltos sin tocar la pantalla
cdd1c6c feat: un concepto se puede pagar en varias veces
479ab2c fix: una sesion local podia borrar cuentas reales de Supabase
99f7a42 fix: el entorno de desarrollo apuntaba a la base de produccion
```

### 1d. Verificación del despliegue — PENDIENTE

Lo que se va a comprobar por SSH: servidor en `9616997`; proceso reiniciado
(etime pequeño); registro de hbuilds con «Generated Prisma Client» y
terminando en el resumen de `vite build`; `stderr.log` sin errores nuevos;
el `bundle` servido cambia respecto a `index-Dj1yC7x0.js`; `health` 401 y
`login` bogus 401; y con el cliente **nuevo** en el servidor, una lectura
`select: { variosPagos: true }` que pruebe que código y esquema coinciden.

Conocido de antemano, del registro del despliegue del 18-sep: el primer
`npm install` falla por un desajuste de `esbuild` dentro de `tsx` y hbuilds
lo recupera solo con `--legacy-peer-deps`. No es un fallo del despliegue;
si esta vez no se recupera, es lo primero que mirar.

---

## 2. Decisiones tomadas sin preguntar

| # | Decisión | Motivo |
|---|---|---|
| D1 | Compuerta del `status` programática en vez de `echo si \| script` | El `si` a ciegas anula la única comprobación que protege producción |
| D2 | Prueba del «código viejo» con el cliente Prisma desplegado en el servidor, no por HTTP autenticado | Los endpoints exigen un JWT real; obtenerlo escribiría en la autenticación de producción. La prueba sustituta ataca la misma capa (las mismas consultas, el mismo cliente, la misma base) |
| D3 | Se corre `cerrar-el-api-de-datos.sql` aunque no haya tabla nueva | Es lo que hace el script oficial; es idempotente; mantener el procedimiento igual vale más que ahorrarse un segundo |

---

## 3. Incidentes

| Cuándo | Qué | Resolución |
|---|---|---|
| 11:56 | Prueba del cliente viejo colgada 120 s: `/proc/<pid>/exe` de `lsnode` no es `node` | Detección de `node` por rutas de CloudLinux con `--version` validado y `timeout` en cada comando remoto |
| 12:02 | SSH: «Connection closed by remote host» y luego «exec request failed on channel 0» — la **cuota de procesos** del hosting compartido, agotada por la sesión colgada (ya vista en esta misma sesión con el error de hilos de `glib`) | Se mató la tarea local colgada. Vigilante en segundo plano hasta que SSH vuelva. **No se despliega sin SSH**: no se podría verificar, y lanzar `npm install` + dos builds en un host al límite de procesos es pedir que falle. La prueba del cliente viejo se hizo mientras tanto por una vía equivalente y local (ver 1b) |

---

## 4. Fases (se rellena al avanzar)

### Fase 2 · registro rápido — HECHA EN LOCAL (rama `fase-2-registro-rapido`, commit `f430ebf`, desde `9616997`) · pendiente de integrar tras el paso 1

**Ajustes del modo autónomo recibidos a las 12:1x y 12:2x:** las paradas
internas de las fases quedan sin efecto; 2.3 se implementa con el borrador;
4.2 se crea con la CLI de Supabase; fase 4 con verificación e2e del login web
antes y después; **fase 5 cambia a HÍBRIDA** (SwiftUI nativo + WKWebView con
sesión única, navegación nativa mezclada, renovación sola, estado sin
conexión, ajustes del frontend al correr embebido); sin desvíos del plan; sin
dependencias nuevas sin motivo; no escribir hasta el informe final.

**Decisiones de la fase 2 hasta ahora:**

| # | Decisión | Motivo |
|---|---|---|
| F2-1 | La rama sale de `9616997` antes de que `Dev` lo sea | Es exactamente lo que `Dev` será tras el fast-forward; git no distingue de dónde se ramificó, solo el commit. Si el despliegue del paso 1 fallara y hubiera vuelta atrás, la fase 2 quedaría sobre react-hooks, que habría que reintegrar igual |
| F2-2 | El merge de `paso-react-hooks` a `Dev` se hará con `git push origin paso-react-hooks:Dev` | git rechaza el push si no es fast-forward —es la condición hecha mecanismo— y no toca el árbol de trabajo, así que la fase 2 puede avanzar en paralelo |
| F2-3 | El buscador sobre el árbol (`indexarArbol`, `buscarEnArbol`, `resolverTerminos`) vive en `@coco/lectura`, no en el frontend | Lo usan dos cosas que no se conocen: la ficha y el diccionario dentro de `clasificar()`. Y la fase 3 se lleva el paquete a la API tal cual |
| F2-4 | Normalización única: `normalizar()` de `@coco/lectura` | `Combo.normal()` era idéntica salvo que no colapsaba espacios. Dos funciones casi iguales es cómo «d1» se encuentra en un sitio y no en otro |
| F2-5 | El diccionario mapea comercios → **términos**, nunca → categorías | Las categorías son de cada cuenta (es lo que el plan pide, aquí se deja constancia) |
| F2-6 | Emparejado del diccionario por **límites de palabra en todos los alias** y **alias más largo primero, consumiendo lo hallado** | «ara» está en «para»; «presto» en «préstamo»; «didi food» contiene «didi». Sin esto el diccionario molesta más de lo que ayuda |
| F2-7 | Pasarelas de pago (Mercado Pago, PayU, Wompi, Bold, Addi, ePayco, Payvalida) en una lista `TUBERIAS` del diccionario, **sin tocar `RECAUDADORES`** | «MERCADO PAGO*D1» tiene que ser D1 y no «mercado». `RECAUDADORES` decide qué NO es el acreedor de un recibo: cambiarlo es cosa de la lectura de soportes, fuera del alcance |
| F2-8 | Se descartan del diccionario: Justo & Bueno, La 14, Beat, iFood, Domicilios.com (cerraron); «metro» (choca con el supermercado); «mio», «une», «max», «amazon», «apple», «google», «microsoft», «cafam», «colpatria», «aire», «pension» sueltos (ambiguos o chocan con `RECAUDADORES`) | Precisión antes que cobertura: una entrada que acierta a medias propone mal |
| F2-9 | Dentro de `clasificar()`, el diccionario es la **última** fuente: solo cuando ninguna firma —palabras clave propias ni catálogo— reconoció nada; y su `confianza` queda **siempre bajo el umbral de revisión** (máx. 0,75) | El diccionario no sabe nada de ESTA cuenta: propone, no decide. Es la precedencia de 2.2 llevada a la lectura |
| F2-10 | `Lectura` gana un campo opcional `enElArbol` con **ids**, certeza y fuente; `EntradaDeLectura` gana `arbol?` | Los nombres son para leer; para elegir hacen falta ids —dos «Mercado» en categorías distintas se llaman igual—. Opcional para no romper las pruebas que construyen `Lectura` a mano |
| F2-11 | El historial (fuente 2) **no participa en la lectura de recibos en el navegador** | Vive en el servidor. La ficha lo aplica después, por `/suggest`, con rango superior al de lo que dijo el recibo. La fase 3 lo unifica al mover el motor a la API. Es la «decisión no evidente» que 2.2 pedía explicar |
| F2-12 | Nuevo endpoint `POST /categorization/learn` | 2.2 pide aprender «reutilizando el upsert que ya existe»; el upsert existía pero no había forma de llegarle desde la ficha. Comprueba que la categoría sea de la cuenta antes de crear la regla |
| F2-13 | `patronParaAprender` con lista de **palabras genéricas** (pago, compra, transferencia, factura…); `aprenderDe` la usa, así que la importación también deja de aprender de ellas | «No aprendas de descripciones vacías o genéricas» es del plan; que alcance a la importación es consecuencia de compartir el upsert, y es deseable: una regla «pago → Mercado» lo clasificaría todo igual |
| F2-14 | `Opcion` de `Combo` pasa a exportarse y la usa el buscador | Regla 17: componentes, no copias. Elegir se ve igual en los dos sitios |
| F2-15 | Las pruebas de `@coco/lectura` van en `frontend/src/lib/*.test.ts` | Es el precedente del repo (`palabras-clave.test.ts`); el paquete no tiene runner propio y añadir `vitest` ahí sería una dependencia nueva para lo mismo |
| F2-16 | En la ficha, la clasificación es **un objeto `{ categoryId, origen }`** con actualizaciones funcionales, y toda propuesta pasa por `aplicar()` | Las propuestas llegan por caminos asíncronos (lectura de recibo, petición); comparar contra un `categoryId` capturado en un render viejo es cómo una sugerencia tardía pisa lo que la persona acaba de elegir |
| F2-17 | Lo que llega **puesto** al abrir —el concepto de un movimiento que se edita, el del pago pendiente que se confirma— se marca como `manual` | Es una elección de la persona; lo automático no debe reclasificar un movimiento guardado ni cambiar el concepto del pendiente que se pulsó |
| F2-18 | **Vaciar a mano también es `manual`** y bloquea lo automático hasta que la ficha se vuelva a abrir | Si no, quitar un concepto haría que la siguiente tecla lo volviera a poner. El plan pone lo manual arriba; un hueco elegido es una elección |
| F2-19 | El catálogo `FIRMAS` (fuente `firma` en la lectura) entra en la ficha con **rango de palabras clave** | El plan define cuatro fuentes y las firmas del catálogo no están entre ellas. Son conocimiento del sistema sobre proveedores concretos de la cuenta: más específicas que el diccionario, menos que el historial. Rango 3 es el que encaja |
| F2-20 | Lo escrito en la descripción se busca en el árbol **por nombre y por palabra clave**; si lleva a un solo concepto, se propone con rango `palabras-clave` | Los nombres de los conceptos también son palabras de la persona. Y como el buscador exige que coincidan todos los tokens, «Pago mercado D1» no acierta por «mercado» a secas: cae al diccionario, que resuelve por «d1» |
| F2-21 | Se aprende al guardar si **alguna fuente automática propuso algo** en esta apertura y el movimiento quedó clasificado con descripción | Es la lectura más fiel de «si el usuario aceptó o corrigió una sugerencia»: aceptar es guardar lo propuesto; corregir es guardar otra cosa después de que algo se propuso. Sin propuesta, no hay nada que confirmar. La petición es `void` con `catch` vacío: aprender es de regalo |
| F2-22 | `useTransactions` gana un segundo parámetro `{ enabled }` | La ficha está siempre montada y solo quiere los recientes al abrirse para crear; sin `enabled` pediría 40 movimientos con la ficha cerrada |
| F2-23 | La cascada queda detrás de «Elegir por centro y categoría», oculta por defecto; en un centro estático se enseña siempre (bloqueada) | El plan la pide «como opción secundaria». En estático no hay nada que elegir, pero sí que leer: los tres niveles bloqueados son la lectura de la clasificación |
| F2-24 | El `id` del concepto de la cascada pasa a `mov-concepto-cascada`; el buscador toma `mov-concepto` | Dos controles con el mismo `id` rompen la etiqueta flotante y el `htmlFor` |
| F2-25 | Con certeza **media**, los candidatos del recibo se enseñan **dentro del buscador** («Del recibo», antes que los recientes) y en la ayuda del campo; no se fuerza el desplegable abierto | `Menu` no tiene apertura controlada y añadírsela sería un cambio fuera del alcance. Los candidatos están a un clic, que es lo que «buscador listo, filtrado con esas opciones» persigue |
| F2-26 | Cinco pruebas de la ficha se **adaptan** a la interfaz nueva: donde comprobaban los tres `Combo` a la vista, ahora comprueban el buscador con nombre + ruta y, tras pulsar «Elegir por centro y categoría», la cascada | Es el cambio que el plan pide; las pruebas describían la interfaz anterior. Su intención —la clasificación llega puesta y se lee aunque esté bloqueada— se conserva palabra por palabra |
| F2-27 | El buscador entra en `NACEN_ENFOCADOS` de `lib/foco.test.ts` con su motivo | Regla 18: la excepción es «un buscador que aparece porque se pidió buscar — el filtro de un Combo». Es el mismo caso, con las mismas palabras |
| F2-28 | `conceptosRecientes` y la sugerencia del historial **toleran respuestas con otra forma** (no lista, sin `category_id`) | Lo destapó la prueba de «deshacer», cuyo mock contesta `{ id }` a cualquier ruta no prevista: la petición nueva de recientes recibía un objeto y `for…of` reventaba la ficha. Los recientes y las sugerencias son comodidades; no pueden tumbar el formulario |
| F2-29 | El historial pide `/categorization/suggest` con **lo escrito en la descripción** (como antes del plan); la lectura de un recibo pone en la descripción el nombre del concepto leído (comportamiento previo, sin cambios) | El plan dice «cuando hay descripción o comercio»; `merchant` sigue a `description` en el cuerpo del movimiento, así que son lo mismo. Mandar el texto completo del OCR al servidor es cosa de la fase 3 (`/transactions/interpret`) |

**Cómo se verificó el «terminado cuando» de la fase 2:**

- *Interacciones para un gasto con clasificación completa.* Convención: se
  cuenta desde el formulario abierto, una interacción por campo tocado o
  botón pulsado; abrir un desplegable y elegir dentro son dos. Antes:
  descripción, valor, centro (2), categoría (2), concepto (2), Registrar =
  **9** (el plan decía siete contando solo elecciones). Ahora, sin sugerencia:
  descripción, valor, abrir el buscador, elegir, Registrar = **5**. Con la
  sugerencia acertando: descripción, valor, Registrar = **3**. Las dos metas
  —cinco o menos, cuatro cuando acierta— se cumplen con margen.
- *Un recibo de un comercio del diccionario propone el concepto correcto.*
  Verificado en la capa donde ocurre, no con una foto en un navegador (no hay
  Playwright en el repo y el OCR de `tesseract.js` necesita un navegador de
  verdad): `clasificar-con-diccionario.test.ts` lee «KOBA COLOMBIA SAS Total
  45.000» contra un árbol con «Mercado» y devuelve ese concepto con certeza
  alta e id; con dos «Mercado» devuelve certeza media y los dos candidatos con
  su ruta; con «UBER» y una categoría «Transporte» vacía, la categoría. La
  ficha toma `enElArbol` y lo pasa por `proponer()`; ese cableado está cubierto
  por las pruebas DOM de la ficha y del buscador (candidatos «Del recibo»).
- Sin cambios de esquema. Nada desplegado aún: espera al cierre del paso 1.
- Verificación final: frontend 359 pruebas (43 archivos), lint 0, typecheck
  limpio; API 285 pruebas (19 suites), lint 0, typecheck limpio; `@coco/types`
  y `@coco/lectura` typecheck limpio. 23 archivos en el commit, incluido este
  registro.

### Fase 3 · un solo cerebro en la API — EN CURSO (rama `fase-3-cerebro-en-la-api`, desde `f430ebf`)

| # | Decisión | Motivo |
|---|---|---|
| F3-1 | La rama sale de `f430ebf` (punta de la fase 2) sin que `Dev` lo tenga aún | Mismo motivo que F2-1: SSH sigue caído por el zombi de `lsnode` y no se despliega sin poder verificar; esperar parado desperdicia horas de trabajo local que no dependen de producción. Las tres ramas quedan en línea recta y se integran en orden cuando SSH vuelva |
| F3-2 | `@coco/lectura` se **compila a CommonJS** (`dist/`) y su `main`/`types` apuntan ahí; el frontend **no cambia** porque ya lo resolvía a la fuente por alias de Vite y `paths` | Es la única forma de que la API lo importe en tiempo de ejecución sin moverlo ni duplicarlo (3.1): `nest build` compila `api/src` y no puede compilar fuentes de otro paquete; Node resuelve `require('@coco/lectura')` por el `main`. El paquete no tiene sintaxis solo-ESM, así que CommonJS sirve para los dos lados |
| F3-3 | El `postinstall` de la raíz compila `@coco/lectura` después de preparar Tesseract; `dist/` va al `.gitignore` | Para que `npm install` deje la API arrancable en local y en hbuilds sin un paso a mano. El `build` de la raíz lo vuelve a compilar (topológicamente antes que `api`), lo que es inocuo |
| F3-4 | Jest de la API mapea `@coco/lectura` a la **fuente** (`moduleNameMapper`), y el `tsconfig` de la API añade el `path` | Las pruebas no dependen de que `dist/` exista, y el typecheck de la API ve los tipos sin compilar nada. En producción, `require` real → `dist` |
| F3-5 | El recorrido «conceptos del árbol → firmas» se mueve al paquete (`conceptosConPalabrasDelArbol`, `firmasDelArbol`); el `firmasDelArbol` del frontend **delega** y conserva su nombre | La API necesita exactamente ese recorrido; dos recorridos distintos es cómo una palabra clave vale en el navegador y no en el servidor. El frontend sigue exportando lo mismo para no tocar a quienes lo importan |
| F3-6 | Ventana de duplicado Wallet↔SMS: **10 minutos** (`VENTANA_DE_DUPLICADO_MS`); parecido parcial hasta 24 h el mismo día, o ±1 día dentro de los 10 minutos (medianoche) | El SMS de un banco colombiano llega entre segundos y un par de minutos; diez cubre un banco lento y una app en segundo plano. Más ancha juntaría dos cafés iguales con media hora de diferencia. El plan pedía proponer el valor |
| F3-7 | Una sugerencia del **historial** vale como certeza **alta** desde el 80 % (`HISTORIAL_SEGURO`); por debajo, media | Con 80 entran la unanimidad (100) y las reglas que la persona creó (85), y quedan fuera las sembradas (60) y los historiales repartidos: justo lo que no debe guardarse sin que alguien lo mire |
| F3-8 | `interpretar()` es **pura**: el servicio le trae el árbol (ids como cadenas) y la sugerencia del historial | Se prueba sin base, igual que `clasificar()`. Los ids viajan como cadenas dentro del motor y vuelven a `bigint` al escribir: sin perder precisión ni mezclar tipos con Prisma |
| F3-9 | Los `source` se validan con el **enum de Prisma** (`@IsEnum(TransactionSource)`) y no con la constante de `@coco/types` | La API nunca importa valores de `@coco/types` (solo tipos, borrados al compilar); el enum generado existe en tiempo de ejecución y es la misma lista |
| F3-10 | El árbol que la API usa para interpretar **excluye lo archivado** | Archivado es «esto ya no vuelve»; proponerlo sería clasificar un gasto de hoy en el gimnasio que se dio de baja. Es la misma lógica de la fase 1 para pendientes, aplicada a las propuestas |
| F3-11 | Una captura **sin monto** se guarda con `0`, `por_revisar` y una nota «Capturado sin valor: hay que ponerlo»; **sin fecha legible**, con la fecha de la captura y `por_revisar` | La fase 5.4 dice que Wallet a veces agota su espera y manda la transacción sin valor, y que se capture igual. Perderla es peor que registrarla en cero para que alguien le ponga la cifra. Un gasto necesita fecha y la de la captura es la mejor aproximación |
| F3-12 | `POST /transactions/capture` responde **siempre 200**, también al crear; `repetido` y `fusionado` dicen qué pasó | La respuesta es «esto es lo que hay con tu referencia». Un 201 solo a veces obligaría al cliente que reintenta a tratar dos códigos como el mismo resultado |
| F3-13 | La condición de carrera de la idempotencia se resuelve **en la base**: un `P2002` del índice único `(user_id, external_ref)` se contesta como repetido | Dos reintentos cruzados pasan los dos la comprobación previa; la segunda inserción choca con el índice y se devuelve lo que ya quedó |
| F3-14 | El historial se consulta con el **comercio** si viene y, si no, con el **texto entero** | Un SMS trae ruido de banco; `sugerirCategoria` lo nota en la confianza (dominancia), que es lo correcto. Recortar el texto a mano sería otra heurística que mantener |
| F3-15 | En la web, `leer-soporte.ts` manda el texto a `/transactions/interpret` y **no conserva una clasificación local de respaldo** | 3.5: «un solo lugar donde cambian las reglas». Un respaldo local serían dos. Si el servidor falla, el archivo queda adjunto y se dice que se escriban los datos a mano |
| F3-16 | `ClasificacionEnElArbol.fuente` del paquete admite `historial` | La respuesta del servidor la trae y la ficha la pasa por su rango; el paquete no la produce, lo dice el comentario |
| F3-17 | La ficha guarda `source: 'web'` y `raw_text` (el texto del recibo leído) en cada movimiento | 3.5 lo pide tal cual. `raw_text` vacío va como `null` |
| F3-18 | Los endpoints van en un **controlador propio** (`InterpretacionController`) bajo el mismo prefijo `/transactions`, en su módulo, que importa `TransactionsModule` para reutilizar `crear` y `obtener` | Dependen de la categorización y del árbol; metidos en el controlador de movimientos lo harían cargar con eso. Nest admite dos controladores con el mismo prefijo |

**Hallazgo — la API ya tenía una suite e2e, y estaba rota desde septiembre.**
`api/test/*.e2e-spec.ts` (supertest, `levantarApp()`, `SupabaseAuthFalso`,
base `coco_test`) existe desde antes del plan; el plan de la fase 4 la creía
inexistente («es la primera prueba e2e del proyecto»). `npm test` no la corre
—va por `npm run test:e2e`— y **nadie la había corrido desde mediados de
septiembre**: `coco_test` llevaba cinco migraciones de retraso
(`palabras_clave`, `presupuesto_en_concepto`, `pago_automatico` del 16–17 de
septiembre, más las dos de este plan), así que toda escritura fallaba con
`PrismaClientKnownRequestError`. Se le aplicaron las cinco (base local de
pruebas) y la suite pasa 158 de 162; los 4 que fallan se analizan abajo. El
criterio «pruebas pasan» de cada fase incluye desde ahora `test:e2e`.

Importante para la fase 0: el arnés sustituye `SupabaseAuthService` entero por
un doble en memoria, así que el candado de `llamar()` no interviene en e2e y
las pruebas de registro siguen sin tocar la autenticación real.

### Fase 2 · borrador del diccionario del sistema (2.3) — implementado tal cual

El plan original pedía entregar este borrador y **esperar revisión** antes
de implementar. El modo autónomo dice detenerse solo en los casos de su
sección 3, y este no está entre ellos, así que se implementa — pero con
tres salvaguardas que acotan el daño de una entrada equivocada: (1) el
diccionario es la **última** fuente de la precedencia, por debajo del
historial y de las palabras clave de la persona, así que solo habla cuando
nadie más tiene nada que decir; (2) con certeza *media* o *ninguna* no
propone un concepto, deja el buscador abierto; (3) nada sugerido se guarda
sin pasar por la ficha. El borrador queda aquí **tal cual se implementó**,
para que la revisión sea sobre lo que de verdad hay en producción.

**Cómo funciona.** Cada comercio tiene alias —las cadenas que salen en un
recibo o un SMS, incluidas razones sociales («KOBA COLOMBIA» es D1)— y cada
grupo tiene **términos genéricos**. El texto se normaliza (sin tildes, en
minúscula), se busca el alias **más largo** que aparezca, y los términos de
su grupo se buscan en el árbol de la persona por nombre y por palabra clave
con el mismo buscador de 2.1. El diccionario **nunca** apunta a una
categoría ni a un concepto concretos: eso es de cada cuenta.

**Dos reglas del emparejado que importan más que la lista:**
- Los alias de **cuatro letras o menos** («d1», «ara», «epm», «etb», «wom»)
  solo cuentan entre límites de palabra: «ara» aparece dentro de «para»,
  «compara» y «barato», y sin esta regla todo lo que diga «para» sería mercado.
- A igualdad de hallazgos gana el alias **más específico**: «didi food» es
  domicilios y «didi» a secas es transporte; «claro hogar» antes que «claro».

**Lo que NO clasifica — las tuberías.** Todo lo que ya está en
`RECAUDADORES` (bancos, PSE, Nequi, Daviplata, Efecty, Baloto, Zona Pagos)
sigue fuera: es por donde pasó la plata, no adónde fue. Y se añaden a esa
misma idea, **dentro del diccionario y sin tocar `RECAUDADORES`** (que
afecta a la lectura de recibos y no es de esta fase): Mercado Pago, PayU,
Wompi, Bold, Addi, ePayco, Payvalida. Un SMS que diga «compra en MERCADO
PAGO» no es mercado.

| Grupo | Términos genéricos (lo que se busca en el árbol) | Comercios / alias | Ya estaba |
|---|---|---|---|
| **Mercado** | mercado, supermercado, víveres, alimentación, despensa, tienda | D1 · *koba colombia* · Ara · *jeronimo martins* · Éxito · *almacenes exito* · Carulla · Olímpica · *supertiendas y droguerias olimpica* · Jumbo · Metro · *cencosud* · Alkosto · Makro · PriceSmart · Colsubsidio · Euro · Surtimax · Super Inter · Zapatoca · Merqueo · Mercamío | — |
| **Restaurantes y domicilios** | restaurante, restaurantes, comida, comidas, domicilio, domicilios, almuerzo, cena, cafetería | Rappi · DiDi Food · McDonald's · *arcos dorados* · Frisby · Kokoriko · El Corral · Crepes & Waffles · Juan Valdez · Starbucks · Subway · KFC · Burger King · Domino's · Papa John's · Sándwich Qbano · Presto · Tostao · Oma · Buffalo Wings · Wok · Archie's | — |
| **Transporte** | transporte, taxi, pasajes, movilidad, parqueadero, parqueaderos | Uber · DiDi · Cabify · inDrive · TransMilenio · Tullave · City Parking · Parking International · *parqueadero* | — |
| **Combustible** | gasolina, combustible, tanqueada, acpm, gas vehicular | Terpel · Primax · Texaco · Mobil · Esso · Biomax · Zeuss · Puma · Brío · *estacion de servicio* · *eds* | — |
| **Peajes** | peaje, peajes, vías, autopista | *peaje* · Flypass · Facilpass · *concesion vial* | — |
| **Farmacia** | farmacia, droguería, medicamentos, medicinas, drogas | Farmatodo · Cruz Verde · La Rebaja · *copservir* · Locatel · Droguería Alemana · Pasteur · Cafam droguería · *drogueria* | — |
| **Servicios públicos** | servicios públicos, agua, luz, energía, gas, acueducto, aseo, alcantarillado | EPM · Emcali · EAAB · *acueducto de bogota* · Enel · Codensa · Air-e · Afinia · Vanti · Triple A · Acuavalle · Veolia · Promoambiental · **Celsia** · **Gases de Occidente** · **Aquaoccidente** | **Celsia, Gases de Occidente y Aquaoccidente ya están en `FIRMAS`** (como conceptos personales; aquí van solo a términos genéricos) |
| **Telecomunicaciones** | internet, celular, telefonía, plan, datos, televisión, cable | **Claro** · **Comcel** · **Movistar** · **Telefónica** · Tigo · *colombia movil* · UNE · ETB · WOM · DirecTV · Virgin Mobile | **Claro/Comcel y Movistar/Telefónica ya están en `FIRMAS`** |
| **Suscripciones digitales** | suscripción, suscripciones, streaming, licencias, licencia, apps, software | Netflix · Spotify · Disney+ · HBO Max · Max · Prime Video · Amazon Prime · YouTube Premium · Apple · *apple.com/bill* · iCloud · Google One · Google Play · Microsoft 365 · Adobe · Dropbox · Canva · OpenAI · ChatGPT · Anthropic · Claude · Notion · Paramount+ · Crunchyroll · Deezer | — (la plantilla trae «Costos variables › Licencias»: el término *licencias* cae ahí) |
| **Salud** | salud, médico, consulta, examen, exámenes, laboratorio, eps, prepagada, odontología, clínica | **Sura** · Sanitas · Colsanitas · Compensar · Nueva EPS · Salud Total · Famisanar · Coomeva · **AXA Colpatria** · Colmédica · Medplus · Colcan · Synlab · Dinámica IPS · *clinica* | **Sura y AXA ya están en `FIRMAS`**. Allianz y Seguros Bolívar también, pero son *seguros*, grupo que el plan no pide |
| **Educación** | educación, colegio, universidad, matrícula, pensión, curso, cursos, útiles | *colegio* · *universidad* · Platzi · Coursera · Udemy · Duolingo · Panamericana · Librería Nacional | Los dos colegios de `FIRMAS` son personales; **no** van al diccionario |

**Fuera del alcance pedido, a propósito:** hogar y ferretería (Homecenter,
Easy), ropa y calzado (Falabella, Zara, Arturo Calle), gimnasios (Smart Fit,
Bodytech), mascotas, belleza. Son grupos reales y frecuentes; se dejan fuera
porque el plan enumeró once grupos y añadir más sin revisión es exactamente
lo que la revisión quería evitar. Añadirlos después es una entrada más en
un archivo.

**Comercios que se consideraron y se descartaron:** Justo & Bueno, La 14,
Beat, iFood, Domicilios.com (cerraron en Colombia); «metro» como transporte
(choca con el supermercado Metro); «mio» (tres letras, demasiado común);
Colsubsidio como *salud* (es también mercado y droguería; se deja solo en
mercado, que es su uso dominante en recibos).
