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
| Identidad | Firebase Authentication, verificada con `firebase-admin` |
| OCR | Tesseract.js + pdf.js en Web Workers, **en el cliente** |
| Pruebas | Jest + Supertest + Playwright |

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

Rellena los `__CAMBIAR__`. Necesitas un proyecto de Firebase con Authentication
habilitada (Google + correo/contraseña):

- **`frontend/.env`** → la configuración web. Es **pública** por diseño: viaja en el
  bundle. Lo que protege los datos es la verificación del token en el backend.
- **`api/.env`** → los tres valores del **service account**. Estos sí son secretos y
  nunca salen del servidor.

Si falta configuración, ni el frontend ni la API revientan con un stack ilegible:
muestran exactamente qué hace falta.

### 4. Instalar, migrar y arrancar

```bash
npm install
npm run prisma:migrate:dev --workspace api   # crea el esquema
npm run dev:api                              # http://localhost:3000/api/v1
npm run dev:web                              # http://localhost:5173
```

---

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev:api` / `npm run dev:web` | Levanta API o frontend en modo desarrollo |
| `npm run build` | Compila ambos workspaces |
| `npm test` | Pruebas unitarias |
| `npm run test:e2e --workspace api` | Integración con Supertest contra `coco_test` |
| `npm run prisma:migrate:dev --workspace api` | Crea y aplica una migración |
| `npm run prisma:studio --workspace api` | Explorador visual de la base |

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

## Documentación

- `docs/Coco_TechStack_Analisis.md` — por qué este stack, dimensionamiento para ~50
  usuarios y plan de migración a la etapa 2.
