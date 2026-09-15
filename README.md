# Coco App — Finanzas personales

Registro consolidado de la vida financiera: movimientos, gastos fijos, presupuestos,
deudas y metas, con importación desde screenshots y extractos mediante **OCR en el
navegador**.

Dos principios lo gobiernan todo:

- **El registro de movimientos es el núcleo.** Saldos, presupuestos, deudas y metas se
  **derivan** de él. No hay saldos almacenados que mantener sincronizados a mano.
- **No-rigidez.** El sistema informa y sugiere, nunca bloquea. Un movimiento puede
  existir sin categoría y eso jamás impide guardarlo.

La arquitectura es **portable-first**: corre gratis hoy en Hostinger y se traslada a
infraestructura profesional sin reescribir la lógica de negocio.

---

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | React 19 + Vite 6 + TypeScript (SPA estática) |
| Estilos | Tailwind CSS 4 + componentes shadcn · iconos **solo** lucide |
| Estado | TanStack Query 5 (servidor) + Zustand 5 (UI efímera) |
| Backend | Node.js 20/22 + NestJS 11 + TypeScript `strict` |
| ORM | Prisma 6 (`schema.prisma` = espejo canónico del modelo) |
| Base de datos | **PostgreSQL 17** en Supabase (`us-east-1`) |
| Identidad | **Supabase Auth** (GoTrue), con la aprobación y los roles en esta app |
| OCR | pdf.js (texto exacto) + Tesseract.js (imágenes), **en el cliente**, tras `OcrProvider` |
| Pruebas | Jest + Supertest (API) · Vitest (frontend) |

---

## Estructura

```
cocoApp/
├─ frontend/          SPA React. Se compila a estáticos.
│  └─ src/
│     ├─ app/         router, providers
│     ├─ features/    una carpeta por módulo
│     ├─ components/  UI reutilizable (shadcn)
│     └─ lib/         apiClient, auth, utils
├─ api/               API NestJS. Entry compilado: dist/main.js
│  ├─ src/
│  │  ├─ modules/     un módulo NestJS por feature
│  │  ├─ common/      guard, filtro, interceptor, decoradores
│  │  └─ prisma/      PrismaModule / PrismaService
│  └─ prisma/         schema.prisma + migrations/
├─ packages/types/    tipos TS compartidos frontend ↔ backend
├─ docs/              PRD y análisis de arquitectura
└─ scripts/           build, deploy, backup
```

---

## Puesta en marcha

### 1. Requisitos

- Node.js ≥ 20
- PostgreSQL 17 (`brew install postgresql@17 && brew services start postgresql@17`)

### 2. Base de datos

```sql
-- Un solo rol con CREATEDB: Prisma necesita crear y destruir la shadow
-- database en cada `migrate diff`, y sin ese permiso falla con P3014.
CREATE ROLE coco_migrate LOGIN PASSWORD '<secreto>' CREATEDB;
```

```bash
createdb -O coco_migrate coco_dev
createdb -O coco_migrate coco_dev_shadow
createdb -O coco_migrate coco_test
```

En producción (Supabase) el usuario es el `postgres` del proyecto. La separación
entre usuario de runtime y usuario de migración que había en MariaDB no se
replicó: Supabase entrega un solo rol y crear otro con menos privilegios es
posible, pero queda pendiente.

### 3. Variables de entorno

```bash
cp api/.env.example         api/.env
cp api/.env.migrate.example api/.env.migrate
cp frontend/.env.example    frontend/.env
```

Rellena los `__CAMBIAR__`. No hace falta ningún servicio externo: la autenticación es
propia. Dos valores importan:

```bash
# api/.env
JWT_SECRET="..."                      # openssl rand -base64 48
BOOTSTRAP_ADMIN_EMAIL="tu@correo.com" # quien se registre así nace admin y activo
```

`frontend/.env` solo lleva la URL de la API. **Todo lo que tenga prefijo `VITE_` es
público** — viaja en el bundle que descarga el navegador —, así que ahí no va nunca un
secreto. La autenticación no necesita ninguno en el cliente.

### 4. Instalar, migrar y arrancar

```bash
npm install
npm run prisma:migrate:dev --workspace api   # crea el esquema
npm run dev:api                              # http://localhost:3000/api/v1
npm run dev:web                              # http://localhost:5173
```

### 5. Crear tu cuenta de administrador

Entra a `http://localhost:5173/registro` y regístrate con el correo de
`BOOTSTRAP_ADMIN_EMAIL`. Esa cuenta nace **admin** y **activa**; el resto nacen
**pendientes** y las apruebas tú desde *Administración → Cuentas*.

Se hace así, y no "el primer registro gana", porque si la app estuviera desplegada
antes de que el dueño se registre, cualquiera se llevaría el panel.

---

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev:api` / `npm run dev:web` | Levanta API o frontend en modo desarrollo |
| `npm run build` | Compila ambos workspaces |
| `npm test` | Pruebas unitarias |
| `npm run test:e2e --workspace api` | Integración con Supertest contra `coco_test` |
| `scripts/nueva-migracion.sh <nombre>` | Crea y aplica una migración **en local** |
| `scripts/desplegar-migraciones.sh` | Lleva las migraciones pendientes a Supabase |
| `npm run sql -- "SELECT ..."` | SQL contra la base local |
| `npm run sql:supabase -- "SELECT ..."` | SQL contra producción |
| `npm run deploy:api` / `npm run deploy:web` | Despliega API o SPA |
| `npm run respaldar` | Respalda producción y verifica que se puede restaurar |
| `npm run prisma:studio --workspace api` | Explorador visual de la base |
| `npm run prepare:ocr` | Deja los recursos de Tesseract en `frontend/public/` |

---

## Reglas del proyecto

Estas no son preferencias de estilo: romperlas produce bugs caros o brechas.

**Dinero.** Todo monto es `DECIMAL(15,2)` en la base y `Prisma.Decimal` en TypeScript.
**Nunca `number`** — el `number` de JavaScript es un flotante IEEE-754 y no representa
exactamente `0.10`; sumar cientos de movimientos acumula error y produce saldos que no
cuadran por centavos. La aritmética usa `.plus()`, `.minus()`, `.times()`. Por la API
los montos viajan como **string decimal**.

**Autorización.** El `user_id` sale SIEMPRE del token verificado, jamás del cliente.
Toda consulta Prisma filtra por él. Un recurso ajeno responde `404`, nunca `403`: no se
confirma que exista.

**Secretos.** Ninguno entra a git. Solo se versionan los `.env.example`.

**Diseño.** Paleta cerrada: `#2A2058` índigo · `#7F4886` morado · `#FBBF40` ámbar ·
`#089C89` teal · `#77BFC9` azul, más escala de grises. **El rojo es exclusivo de errores
y acciones destructivas.** Ingreso = teal, gasto = morado, alerta = ámbar. El estado
nunca depende solo del color: siempre lleva además signo e icono. Tipografías: solo
**Montserrat** (texto) y **Lora** (títulos). Iconos: solo **lucide**.

**Portabilidad.** Esquema en SQL portable, API sin estado, configuración por entorno,
frontend 100% estático, OCR detrás de una interfaz intercambiable. Son las reglas que
permiten mover cada pieza a otra infraestructura sin reescribir nada.

**Pruebas.** La lógica de dinero (prorrateo, saldos, dedupe, amortización) no se libera
sin pruebas verdes. Ninguna fase se cierra con esas pruebas en rojo.

---

## Importar extractos (M4)

El documento **nunca se sube**. Se lee en el navegador y al servidor solo viajan
los movimientos ya parseados. La diferencia no es cosmética: un extracto trae el
número de cuenta, los saldos y el nombre del titular, y nada de eso tiene por qué
salir del equipo.

```
navegador                                  servidor
─────────                                  ────────
PDF/imagen → OcrProvider → parser  ──filas──▶  huella + posible repetido
                                                + sugerencia de categoría
                                     ◀─borrador─
       revisión y corrección
                                   ──confirmar──▶  crea los movimientos
                                                   (idempotente)
                                   ──deshacer───▶  los quita todos
```

**Los pasos no se pueden saltar.** Un OCR se equivoca, y un movimiento
equivocado que entra sin mirar contamina saldos e informes durante meses.

| Pieza | Decisión | Por qué |
|---|---|---|
| PDF con texto | `pdf.js` lee las letras exactas | Rasterizar un texto perfecto para volver a adivinarlo sería absurdo |
| Imagen | `Tesseract.js` en un Web Worker | Cada usuario aporta su CPU; el backend no procesa imágenes |
| Recursos de Tesseract | Servidos desde nuestro origen | Por defecto los trae de un CDN en tiempo de ejecución: sería ejecutar un WASM de terceros que nunca pasó por el lockfile |
| Montos | `45.900` son cuarenta y cinco mil novecientos | `parseFloat` daría 45.9 y el extracto entero quedaría mil veces mal |
| Columna de saldo | Se deduce del documento, no de cada línea | Confundir el saldo corriente con el monto produce cifras absurdas que se ven plausibles |
| Referencias y fechas | Se tapan antes de buscar montos | `REF 000123456` generaba un movimiento de $456 salido de la nada |
| Repetidos | Se **señalan**, no se descartan | Dos cafés de $5.000 el mismo día en el mismo sitio son dos movimientos reales |
| Confirmar | Idempotente por el estado del lote | Un reintento por red intermitente no puede duplicar cuarenta movimientos |

### Categorización automática (T1)

Sugiere, nunca decide — un movimiento sin categoría siempre se puede guardar.
En orden de fuerza:

1. **Tu historial.** Si ya clasificaste "rappi" como Domicilios ocho veces, esa
   es la respuesta. Es mejor que cualquier lista, porque refleja cómo organizas
   *tus* finanzas.
2. **Reglas que creaste**, reforzadas cada vez que aceptas una sugerencia.
3. **Reglas sembradas**, solo para que la primera importación no llegue vacía.

Si nada alcanza el 40 % de confianza, no sugiere nada. Sugerir mal es peor que
no sugerir: una categoría equivocada que se cuela sin mirar contamina los
informes, y descubrirlo tres meses después cuesta mucho más que haberla escrito
a mano.

---

## Dos herencias de MariaDB

El proyecto nació sobre MariaDB y migró a PostgreSQL. Dos diferencias entre los
motores obligaron a cambios que conviene no deshacer sin entender por qué.

**Las mayúsculas ahora cuentan.** La colación de MariaDB comparaba texto sin
distinguirlas, y el get-or-create de etiquetas dependía de eso: "Comida" y
"comida" chocaban contra el unique y devolvían la misma fila. Postgres las
considera distintas. Por eso `tags.module.ts` busca con `mode: 'insensitive'` y
existe el índice `uq_tags_user_name_ci` sobre `lower(name)`: el código evita el
duplicado y el índice atrapa las carreras entre peticiones simultáneas.

**Los timestamps guardan milisegundos, no segundos.** MariaDB truncaba al
ajustar la precisión; Postgres REDONDEA. Con `timestamp(0)`, escribir
`ahora + 1000 ms` y releerlo devolvía hasta medio segundo de más, y eso rompía
el cálculo del retraso por fuerza bruta. Tampoco ahorraba nada: en Postgres todo
timestamp ocupa 8 bytes sea cual sea su precisión declarada.

---

## Bases de datos

Tres bases, tres formas de llegar:

| Base | Para qué | Cómo consultarla |
|---|---|---|
| `coco_dev` (Postgres local) | Desarrollo | `npm run sql -- "SELECT ..."` |
| Supabase (`us-east-1`) | Producción | `npm run sql:supabase -- "SELECT ..."` |
| `coco_test` (Postgres local) | Pruebas e2e | la maneja Jest |

`sql:supabase` va por la Management API, no por conexión directa: se autentica
con el token y no necesita la contraseña de Postgres.

Estas herramientas son para **datos**. La **estructura** se cambia siempre por
migración — `scripts/nueva-migracion.sh` en local,
`scripts/desplegar-migraciones.sh` a producción — porque un `CREATE TABLE` a
mano queda fuera de `schema.prisma` y el próximo diff intentaría crearlo de
nuevo.

---

## Respaldos

```bash
npm run respaldar          # a ./respaldos
npm run respaldar -- /ruta # a donde quieras
```

El plan gratuito de Supabase retiene respaldos poco tiempo y no ofrece
recuperación a un punto en el tiempo. Este script vuelca esquema y datos a un
archivo local, **lo restaura en una base desechable y cuenta las filas**: un
respaldo que nunca se probó no es un respaldo, y el día que hace falta es tarde
para descubrirlo. Conserva los 14 más recientes.

El volcado se acota al esquema `public` a propósito. Sin eso arrastra las
extensiones internas de Supabase y el archivo solo sirve para restaurar en otro
Supabase — justo lo que no querés de un respaldo. Las tablas de la aplicación
viven todas en `public`.

`respaldos/` está en `.gitignore`: son datos financieros reales.

---

## Desplegar

```bash
npm run deploy:api    # compila, sube, regenera Prisma y reinicia
npm run deploy:web    # compila la SPA y la sube
```

La SPA la sirve el **propio proceso de la API** (`SpaModule`) desde su carpeta
`frontend/dist`. `public_html` quedó vacío cuando se unificaron API y SPA en un
dominio: subir ahí produce un despliegue que parece exitoso y no cambia nada.

### Tres trampas del hosting

Las tres provocaron despliegues que se reportaban exitosos mientras el sitio
estaba caído o servía lo viejo. Están resueltas en los scripts; quedan escritas
para que nadie las reintroduzca.

**1. Las variables de hPanel le ganan al `.env`.** LiteSpeed inyecta al proceso
las variables configuradas en hPanel al crear la Node.js App. Esa configuración
no se ve desde el repositorio ni desde SSH, y `dotenv` nunca pisa una clave que
ya existe. Tras migrar a Postgres, hPanel seguía inyectando la `DATABASE_URL` de
MariaDB y ganaba siempre. Por eso `main.ts` carga su `.env` con `override: true`
y por ruta absoluta: **el archivo del despliegue es la fuente de verdad, no
hPanel**.

El síntoma engañaba: Prisma fallaba con `P1012` — *"the URL must start with
postgresql://"* — que se lee como una URL mal escrita.

Y en parte lo estaba: **la variable llega con las comillas dentro del valor**.
LiteSpeed inyecta lo que hPanel guardó, sin interpretarlas, así que el proceso
recibe literalmente `"postgresql://…"`. Un archivo `.env` lo tolera porque
dotenv sí las interpreta; una variable de entorno no. Por eso `main.ts` también
desentrecomilla lo que hereda: mientras el `.env` exista no cambia nada, pero el
día que falte el valor heredado al menos sirve en vez de romper por un par de
comillas.

Se intentaron tres formas de limpiar esa variable desde SSH y **ninguna
funciona**: `UnsetEnv` en el `.htaccess` LiteSpeed lo ignora, editar
`hbuilds/config/.env` no altera lo que se inyecta, y no hay API pública para la
Node.js App de un plan compartido. Solo se puede quitar desde hPanel. No es
urgente —el `.env` del despliegue manda y el valor heredado ya apunta a
Supabase— pero conviene borrarla para que nadie crea que cambiarla ahí hace algo.

**2. El `restart.txt` que importa es el de `tmp/`.** Hay otro en la raíz del
dominio que no mira nadie. LiteSpeed vigila el que declara `PassengerRestartDir`
en `public_html/.htaccess`, dentro del app root. Tocar el equivocado deja el
proceso viejo corriendo con el código nuevo en disco.

**3. `npx prisma generate` no funciona en el servidor.** El enlace
`node_modules/.bin/prisma` no tiene permiso de ejecución en el plan compartido;
hay que invocarlo por `node node_modules/prisma/build/index.js generate`. Y sin
tubería: con `| tail` el código de salida es el del `tail` y el fallo pasa
inadvertido.

### El 503 que aparece solo

Si el sitio devuelve 503 sin que nadie haya tocado nada, el sospechoso es el
motor de Prisma. Tras un rato sin tráfico entraba en pánico con `PANIC: timer
has gone away` —su hilo de temporizadores desaparece con una espera pendiente—
y se llevaba el proceso por delante.

La excepción nace dentro de Rust: no hay `try` en JavaScript que la contenga.
Hay dos mitigaciones, y las dos están puestas:

- **Un latido** en `PrismaService`: una consulta trivial cada cuatro minutos
  para que no haya ventana de inactividad. No es elegante; lo elegante sería que
  el motor no entrara en pánico, pero 6.19.3 es la última de la serie 6 y el
  arreglo vive en un major que sigue en release candidate.
- **Una red de seguridad** en `main.ts`: deja una línea legible en el log y sale,
  para que la plataforma levante un proceso sano en vez de quedarse uno que
  responde 500 a todo.

Para levantarlo a mano: `touch <approot>/tmp/restart.txt`.

### Comprobar un despliegue

`/api/v1/health` responde **401 antes de tocar la base**, así que no prueba nada
sobre la conexión. Para saber si la base responde hay que usar el login, que sí
consulta `users`: un 401 con mensaje de credenciales significa que la consulta
se ejecutó; un 500 o un 503, que no.

### Volver atrás

Ya no hay vuelta atrás a MariaDB: esa base se vació tras confirmar que Postgres
funcionaba. Su último volcado quedó en `respaldos/mariadb-final.sql`, fuera del
repositorio.

Lo que sí se puede revertir es el CÓDIGO: cada despliegue deja un respaldo con
fecha en `~/respaldos-cocoapp/` del servidor, con `api/dist`, `api/prisma`, el
cliente de Prisma y el `.env` de ese momento.

## Autenticación

Las credenciales las guarda y verifica **Supabase Auth**. Esta app conserva lo
que Supabase no modela y que es del producto:

| Pieza | Quién la tiene | Por qué |
|---|---|---|
| Contraseñas, su hash y su verificación | Supabase | No hay motivo para reimplementarlo |
| Emisión y rotación de tokens | Supabase | ES256, 15 min de vida, refresh rotatorio |
| **Aprobación por un admin** | Esta app | Toda cuenta nace `pending`. Supabase daría por buena cualquier cuenta con el correo confirmado |
| **Roles y estado** | Esta app | El guard los lee de la base en CADA petición, no del token |
| **Revocación inmediata** | Esta app | `users.sessions_valid_from` |
| **Bitácora** | Esta app | Cada entrada, salida y fallo, con IP y agente |
| **Política de contraseñas** | Esta app | Comprueba filtraciones conocidas y que no derive del nombre o el correo |

### El navegador no habla con Supabase

Lo idiomático sería usar `supabase-js` en el frontend. Aquí la API hace de
intermediaria por una razón concreta: el refresh token vive en una **cookie
httpOnly con SameSite=Strict**, y `supabase-js` lo guardaría en `localStorage`,
donde cualquier script inyectado puede leerlo. Para datos financieros esa
diferencia pesa más que la comodidad.

### Verificación de la firma

Contra el **JWKS** del proyecto (ES256), con `jose`. La API no guarda ningún
secreto de firma, y una rotación de claves en Supabase no exige redespliegue.

### La marca de revocación va en segundos

`sessions_valid_from` se compara contra el `iat` del token, que solo tiene
precisión de SEGUNDOS. De ahí dos detalles que parecen arbitrarios y no lo son:

- Al **crear** una cuenta la marca se recorta al segundo. Con milisegundos, el
  primer token emitido parecería anterior a su propia sesión y el guard lo
  rechazaría nada más nacer.
- Al **revocar** se apunta al segundo SIGUIENTE. Apuntar al actual dejaría vivos
  los tokens emitidos en ese mismo segundo, que es justo la ventana que
  necesitaría alguien con un token robado.

Volver a entrar en el mismo segundo en que se cerraron todas las sesiones caería
del lado equivocado, así que `entrar` baja la marca hasta el token nuevo. Solo
puede revivir tokens de ESE segundo, y solo después de que alguien demuestre que
conoce la contraseña.

### Lo que se perdió al migrar

Honestidad sobre el cambio: el login ya no resiste ataques de tiempo. Antes se
gastaba un argon2 equivalente cuando el correo no existía, para que la duración
de la respuesta no delatara qué correos tienen cuenta. Esa verificación ahora
ocurre dentro de Supabase y ese control dejó de ser nuestro. En el **registro**
sí se conserva el equivalente: se llama a Supabase exista o no el correo, y la
respuesta es idéntica en ambos casos.

También se perdió el detalle en la bitácora de un login fallido: ya no se
distingue "el correo no existe" de "la contraseña es incorrecta", porque
Supabase responde igual a ambos.

## Documentación

- `docs/Coco_TechStack_Analisis.md` — por qué este stack, dimensionamiento para ~50
  usuarios y plan de migración a la etapa 2.
