# Auditoría de copy — Coco

_Revisión completa de los textos de interfaz contra la guía de estilo. 16 de septiembre de 2026._

---

## 1. Resumen

| | |
|---|---|
| Cadenas de interfaz revisadas | **406**, en 69 archivos |
| Cadenas corregidas | **24** |
| Cadenas sin cambios | **382** |
| Archivos tocados | 11 |
| Verificación | `tsc` limpio · 321 pruebas · compila |

### Alcance

No hay archivos de i18n: todo el texto vive incrustado en los componentes. Se recorrieron:

- `frontend/src/**/*.tsx` — botones, etiquetas de campos, marcadores de posición, ayudas,
  títulos y descripciones de fichas, menús, navegación, estados vacíos, mensajes de error y
  validación, avisos flotantes, confirmaciones y banners.
- `frontend/src/lib/*.ts` — periodos del selector de fechas y textos derivados.
- `api/src/**/*.ts` — **mensajes de excepción**, porque se renderizan tal cual dentro de las
  alertas de la interfaz.

Fuera de alcance, por indicación expresa: identificadores, nombres de variables,
interpolaciones, registros, comentarios de código y textos de pruebas.

### Guía aplicada

1. Sin coloquialismos ni regionalismos.
2. Tono cercano pero correcto. Sin jerga, muletillas ni emojis decorativos.
3. Tuteo, sin informalidad.
4. Etiquetas de campo claras, breves y sin ambigüedad.
5. Consistencia terminológica en toda la app.
6. Claridad por encima de la economía o el ingenio.

---

## 2. Cambios

| # | Ubicación | Antes | Después | Regla |
|---|---|---|---|---|
| 1 | `components/toolbar-filtros.tsx` · menú Nuevo movimiento | Plata que sale | Dinero que sale | 1 |
| 2 | `components/toolbar-filtros.tsx` · menú Nuevo movimiento | Plata que entra | Dinero que entra | 1 |
| 3 | `features/accounts/accounts-page.tsx` · ayuda de cabecera | Dónde tienes tu **plata**. El saldo se calcula de tus movimientos. | Dónde tienes tu **dinero**. El saldo se calcula de tus movimientos. | 1 |
| 4 | `features/accounts/accounts-page.tsx` · estado vacío | Crea la primera —efectivo, **tu débito** o una tarjeta— | Crea la primera —efectivo, **tu tarjeta débito o una de crédito**— | 1, 6 |
| 5 | `features/centros/centros-page.tsx` · ayuda de cabecera | La estructura con la que se ordena tu **plata**. | La estructura con la que se ordena tu **dinero**. | 1 |
| 6 | `features/centros/centros-page.tsx` · nivel 1 | El bloque grande de tu **plata**. | El bloque grande de tu **dinero**. | 1 |
| 7 | `features/centros/centros-page.tsx` · «Cómo funciona» | ¿cuánto **se fue** en servicios públicos? | ¿cuánto **se gastó** en servicios públicos? | 1, 6 |
| 8 | `features/cuenta/ajustes.tsx` · Llevar cuentas | …registras gastos sin tener que decir de dónde salió **la plata**. | …de dónde salió **el dinero**. | 1 |
| 9 | `features/imports/revisar-page.tsx` · aviso de duplicados | **Ojo:** dos compras iguales el mismo día en el mismo sitio son dos movimientos reales — **decide tú**. | **Ten en cuenta que** dos compras iguales el mismo día en el mismo sitio son dos movimientos reales: **la decisión es tuya**. | 2 |
| 10 | `features/admin/usuarios-page.tsx` · contraseña restablecida | **Listo.** Comunícale la contraseña nueva a {usuario} por un canal seguro. | **Contraseña restablecida.** Comunícasela a {usuario} por un canal seguro. | 2, 6 |
| 11 | `features/centros/confirmar-borrado.tsx` · etiqueta del campo | **Pasan a** | **Categoría de destino** | 4, 5 |
| 12 | `features/admin/usuarios-page.tsx` · título de pantalla | Cuentas | **Usuarios** | 5 |
| 13 | `features/transactions/movimiento-modal.tsx` · vía «Registrar manualmente» | Sin soporte, o con la clasificación **ya sabida**. | Sin soporte, o **cuando ya sabes cómo clasificarlo**. | 6 |
| 14 | `features/dashboard/dashboard-page.tsx` · saludo | Hola de nuevo, {nombre}**!** | **¡**Hola de nuevo, {nombre}**!** | 2 |
| 15 | `api/…/imports.service.ts` | Esa fila no existe en este **lote**. | Esa fila no existe en esta **importación**. | 5 |
| 16 | `api/…/imports.service.ts` | Este **lote** fue descartado y ya no se puede confirmar. | Esta **importación** fue descartada y ya no se puede confirmar. | 5 |
| 17 | `api/…/imports.service.ts` | Este **lote** no está confirmado, así que no hay nada que deshacer. | Esta **importación** no está confirmada, así que no hay nada que deshacer. | 5 |
| 18 | `api/…/imports.service.ts` | Este **lote** ya está confirmado. Usa **"deshacer"** en su lugar. | Esta **importación** ya está confirmada. Usa **"Deshacer la importación"** en su lugar. | 5 |
| 19 | `api/…/imports.service.ts` | El **lote de importación** no existe. | Esa **importación** no existe. | 5 |
| 20 | `api/…/imports.service.ts` | El **lote** ya no está en revisión. | Esa **importación** ya no está en revisión. | 5 |
| 21 | `api/…/soportes.service.ts` | **No existe ese soporte.** | **El soporte no existe.** | 5 |
| 22 | `api/…/soportes.service.ts` | **No existe ese soporte.** _(segunda aparición)_ | **El soporte no existe.** | 5 |
| 23 | `api/…/soportes.service.ts` | **No existe ese movimiento.** | **El movimiento no existe.** | 5 |
| 24 | `api/…/categories.service.ts` | Ese concepto tiene **cosas** dentro. Vacíalo antes de unificarlo. | Ese concepto tiene **otras categorías** dentro. Vacíalo antes de unificarlo. | 4, 6 |

### Dos criterios que conviene dejar por escrito

**«Pasan a» → «Categoría de destino»**, y no «Nueva categoría». El `Select` que hay dentro
de ese campo ya se anunciaba así a los lectores de pantalla, de modo que el cambio arregla a
la vez la etiqueta vaga (regla 4) y la incoherencia de llamar de dos formas al mismo campo
(regla 5). «Nueva categoría» se descartó porque sugiere crear una.

**El título «Cuentas» de administración → «Usuarios».** La navegación ya decía «Usuarios», y
«Cuentas» nombra otra cosa en esta app —las cuentas bancarias, que tienen su propia pantalla
con ese mismo título—. Dos pantallas distintas no pueden llamarse igual.

---

## 3. Sin cambios relevantes

382 cadenas cumplen la guía. Reparto por archivo, como evidencia del recorrido:

| Archivo | Revisadas | Archivo | Revisadas |
|---|---|---|---|
| `features/transactions/movimiento-modal.tsx` | 30 | `features/cuenta/cuenta-page.tsx` | 11 |
| `features/centros/centros-page.tsx` | 28 | `features/centros/categoria-modal.tsx` | 10 |
| `components/soportes.tsx` | 24 | `features/auth/register-page.tsx` | 9 |
| `features/imports/importar-page.tsx` | 17 | `api/…/imports.service.ts` | 9 |
| `features/imports/revisar-page.tsx` | 16 | `features/auth/login-page.tsx` | 8 |
| `components/toolbar-filtros.tsx` | 13 | `features/admin/bitacora-page.tsx` | 8 |
| `features/admin/usuarios-page.tsx` | 13 | `features/centros/concepto-modal.tsx` | 8 |
| `features/imports/guia-csv.tsx` | 13 | `api/…/auth.service.ts` | 8 |
| `features/accounts/accounts-page.tsx` | 12 | `components/paginador.tsx` | 8 |
| `components/tabla-de-movimientos.tsx` | 11 | Otros 49 archivos | 1–7 cada uno |

### Revisadas y conservadas a propósito

| Texto | Por qué se queda |
|---|---|
| ¡Hola de nuevo! | Cercano y correcto. La regla 2 permite cercanía; no hay jerga ni muletilla. |
| «Listo» _(etapa de progreso y botón de atajos)_ | Ahí es un adjetivo —«terminado»—, no una muletilla de acuse. |
| Bitácora | Término consistente entre la navegación y la pantalla, y preciso. |
| Todo · Mes en curso · Mes pasado · Últimos 3 meses · Año en curso · Año pasado · Personalizado | Los siete periodos del selector, con sus ayudas. Claros y breves. |
| El destino está dentro de lo que se va a eliminar. Elige uno de fuera. | «De fuera» es español correcto, no un regionalismo. |
| Tu cuenta está pendiente de aprobación. Te avisaremos cuando esté lista. | Tuteo correcto, sin informalidad. |

No hay **ni un emoji decorativo** en toda la interfaz.

---

## 4. Requiere tu decisión

Casos ambiguos, **no aplicados**, con la propuesta al lado.

| Ubicación | Texto actual | Propuesta | Por qué no se aplicó |
|---|---|---|---|
| `features/dashboard/dashboard-page.tsx` · error de carga | Revisa que **la API** esté corriendo. | Revisa tu conexión e inténtalo de nuevo. | «API» es jerga técnica, pero el texto actual es una pista de diagnóstico real. Cambiarlo pierde información para quien opera la app. |
| `api/…/auth` | **Token** inválido o expirado. | El enlace ya no es válido. Vuelve a entrar. | «Token» no significa nada para un usuario, pero el mensaje cubre varios flujos y no en todos se trata de un enlace. |
| `lib/filtros.ts` vs. selector de fechas | Periodo **«Todo»** en la lista, **«Todo el histórico»** en el control | Unificar en «Todo el histórico» | El mismo periodo con dos nombres (regla 5), pero la forma corta puede ser deliberada por el ancho de la columna de atajos. |
| `api/…/parse-bigint.pipe.ts` | El **identificador** debe ser un número entero positivo. | Dejar igual | Técnico, pero exacto. Solo aparece ante una dirección manipulada a mano. |
| `api/…/categories.service.ts` | El destino está dentro de lo que se va a eliminar. **Elige uno de fuera.** | Elige uno que no esté dentro. | Las dos son correctas; la actual es más breve y no incumple ninguna regla. |

---

## 5. Glosario de términos normalizados

### Lo que no se dice

| No se dice | Se dice |
|---|---|
| plata | dinero |
| se fue (en) · en qué se fue | se gastó (en) · en qué se gastó |
| lote _(de importación)_ | importación |
| cosas · elementos | el sustantivo concreto: categorías, movimientos, conceptos |
| Ojo: | Ten en cuenta que |
| Listo. _(como acuse de recibo)_ | el resultado concreto: «Contraseña restablecida.» |
| decide tú | la decisión es tuya |
| tu débito | tu tarjeta débito |
| Cuentas _(para las de usuario)_ | Usuarios — «Cuentas» son las bancarias |
| Pasan a _(como etiqueta)_ | Categoría de destino |
| añadir · adjuntar · cargar _(como acción)_ | **agregar** |

### Lo que sí se dice, y no se toca

Conceptos ya asentados en el producto: **movimiento**, **concepto**, **grupo**, **centro de
costos**, **soporte**, **periodo**, **saldo**, **importación**, **bitácora**.

**Dashboard** es el nombre de la primera pantalla, por decisión del producto (antes se
llamaba «Resumen»). Es un anglicismo y se acepta como nombre propio de esa sección: no se
traduce de vuelta, y tampoco se usa como sustantivo común en mitad de una frase.

**«Agregar» es el único verbo para sumar algo**: un soporte, un atajo, una
palabra clave. Convivían «Añadir soporte», «Adjuntar los soportes» y «Añadir
atajo» para el mismo gesto. Ojo con lo que NO es agregar: **cargar** en el
sentido de traer datos —«No se pudo cargar el dashboard», «Cargando el
soporte»— se queda como está, porque ahí no se suma nada.

### Forma fija de los mensajes

| Caso | Forma |
|---|---|
| Algo no existe | `El/La {cosa} no existe.` — nunca «No existe ese {cosa}». |
| Algo no es tuyo | `La {cosa} indicada no existe o no es tuya.` |
| Sesión caída | `La sesión {expiró · fue cerrada · ya no es válida}. Vuelve a entrar.` |
| Cuenta bloqueada | `Tu cuenta {está suspendida · no está habilitada}. Contacta al administrador.` |

---

## 6. Método

1. Extracción automática de todas las cadenas candidatas de `frontend/src` y `api/src`
   —propiedades de texto (`placeholder`, `title`, `aria-label`, `etiqueta`, `ayuda`,
   `titulo`, `marcador`, `explicacion`…), nodos de texto de JSX y mensajes de excepción—,
   descartando comentarios de bloque y de línea.
2. Barrido dirigido de coloquialismos conocidos: `plata`, `ojo`, `se fue`, `toca`, `listo`,
   `de una`, `un montón`, `chévere`, `guita`, `chao`, `pinta`.
3. Barrido de emojis decorativos en todo el texto de interfaz.
4. Revisión manual de cada cadena contra las seis reglas.
5. Corrección con verificación de tipos, pruebas y compilación tras cada tanda.
