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
| Base de datos | **MariaDB** (Prisma la trata con `provider = "mysql"`) |
| Identidad | **Propia**: argon2id + JWT corto + refresh rotatorio (ver abajo) |
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
- MariaDB 11.8 (`brew install mariadb@11.8 && brew services start mariadb@11.8`)

### 2. Base de datos

```sql
CREATE DATABASE coco_dev        CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE coco_dev_shadow CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE coco_test       CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Runtime: mínimo privilegio, SIN DDL
CREATE USER 'coco_app'@'localhost' IDENTIFIED BY '<secreto>';
GRANT SELECT, INSERT, UPDATE, DELETE ON coco_dev.* TO 'coco_app'@'localhost';

-- Migración: usuario separado con DDL
CREATE USER 'coco_migrate'@'localhost' IDENTIFIED BY '<secreto>';
GRANT ALL PRIVILEGES ON coco_dev.*        TO 'coco_migrate'@'localhost';
GRANT ALL PRIVILEGES ON coco_dev_shadow.* TO 'coco_migrate'@'localhost';
GRANT ALL PRIVILEGES ON coco_test.*       TO 'coco_migrate'@'localhost';
```

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
| `scripts/nueva-migracion.sh <nombre>` | Crea y aplica una migración (ver nota de MariaDB) |
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

## Una peculiaridad de MariaDB

MariaDB no tiene tipo `JSON` nativo: es un alias de
`longtext CHECK (json_valid(...))`, y `information_schema` reporta `longtext`.
Prisma compara su `Json` contra ese `longtext`, ve una diferencia y emite un
`MODIFY ... JSON` en **cada** `migrate diff`. Aplicarlo no cambia nada —
comprobado: tras el `ALTER`, MariaDB sigue reportando `longtext`.

Es una diferencia irresoluble, no un error. `scripts/nueva-migracion.sh` la
filtra para que las migraciones nuevas no arrastren `ALTER`s inertes que, con el
tiempo, esconderían un cambio de verdad entre el ruido.

---

## Autenticación

Es propia, sin proveedor externo. Cada decisión responde a una amenaza concreta.

| Control | Cómo | Contra qué |
|---|---|---|
| Hash de contraseña | argon2id, 19 MiB · t=2 · p=1 (OWASP) | El costo en **memoria** hace inviable el ataque masivo con GPU |
| Política | 12+ caracteres, mayúscula, minúscula, número y símbolo, no derivada del correo ni del nombre, contrastada contra Have I Been Pwned por k-anonimato | Adivinación y credenciales ya filtradas |
| Access token | JWT de **15 minutos**, en memoria del cliente — nunca en localStorage | Un XSS no puede leer memoria; y aunque robara el token, vale 15 minutos |
| Refresh token | Opaco, 256 bits, **rotatorio**, en cookie `httpOnly` + `SameSite=Strict` + `Secure` en producción, guardado solo como SHA-256 | El JavaScript no puede leerlo; sin CSRF sobre `/auth`; una filtración de la base no entrega tokens usables |
| Detección de reuso | Presentar dos veces el mismo refresh revoca la **familia** entera | Convierte un robo silencioso en un cierre de sesión visible para el dueño |
| Revocación inmediata | `sessions_valid_from` se compara en cada petición | Cerrar sesión, suspender o cambiar contraseña surte efecto **ya**, sin esperar a que expire nada |
| Aprobación manual | Toda cuenta nace `pending` | Nadie entra sin que un administrador lo autorice |
| Roles | `admin` / `user`, leídos de la **base** en cada petición, no del token | Degradar a alguien aplica en la petición siguiente |
| Anti-enumeración | Registro y login responden idéntico exista o no la cuenta; el correo inexistente gasta el mismo tiempo contra un hash señuelo | Nadie averigua qué correos tienen cuenta, ni por el mensaje ni por el reloj |
| Anti-fuerza bruta | Retraso exponencial tras 5 fallos, con tope de 15 min — **no** bloqueo duro | Un bloqueo permitiría dejar a alguien fuera de su propia cuenta fallando su login |
| Límite de tasa | 5 registros/min, 10 logins/min, 30 refresh/min | Cada intento cuesta un argon2 de 19 MiB: sin tope sería agotamiento de recursos |
| Auditoría | Quién, qué y cuándo — nunca contraseñas, tokens ni montos | Investigar un incidente sin convertir la bitácora en otro botín |

**Lo que todavía no hay, a propósito:** envío de correos (así que no hay autoservicio de
recuperación — la restablece un administrador) y 2FA. El esquema no impide añadirlos.

---

## Documentación

- `docs/Coco_TechStack_Analisis.md` — por qué este stack, dimensionamiento para ~50
  usuarios y plan de migración a la etapa 2.
