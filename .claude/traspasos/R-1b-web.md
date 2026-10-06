# R-1b-web — arreglos pequeños de la web y de los scripts

Rama `fix/web-hardening`, PR contra `Dev` sin integrar. Los tres puntos del reto
(auditoría del 5 oct, `bcf899e`) seguían abiertos en `Dev` (`4843bc4`).

## Hecho

- **OCR local.** `rutasDelOcr()` en `features/transactions/api/leer-soporte.ts`:
  `workerPath`, `corePath` y `langPath` absolutos sobre `/tesseract/` del propio
  origen, `gzip: false` (el script baja `spa.traineddata` sin comprimir) y
  `workerBlobURL: false` (sin `blob:`, que la CSP tendría que permitir).
  Prueba: `leer-soporte.test.ts` comprueba lo que recibe `createWorker`.
- **`errorElement`.** `app/pantalla-de-error.tsx`, colgada de una ruta raíz sin
  camino que envuelve todas (`rutas` exportado en `router.tsx`). Usa
  `TITULO_DE_PAGINA` como el 404; distingue un trozo borrado por un despliegue
  («Hay una versión nueva de Coco») de cualquier otro fallo. No enseña el error.
- **`vite:preloadError`.** `app/recarga-por-version.ts`, instalado en `main.tsx`:
  recarga una vez; guardia en `sessionStorage` (60 s). Sin `sessionStorage` no
  recarga. Pruebas de ambos en `app/*.test.ts(x)`.
- **`deploy:*` fuera.** Borrados los dos scripts de `package.json`,
  `scripts/desplegar-api.sh` y `scripts/desplegar-frontend.sh`; runbook al día.
  Ni CI ni otro script los usaba.

## Pendiente

- `docs/standards/rename-map.json` aún lista los dos scripts borrados (con sus
  contadores): no lo toqué porque el renombrado está en curso; quien haga la
  porción `scripts` debe quitar esas dos entradas.
- Recorrido de Playwright con el CDN bloqueado y una imagen de verdad (lo pide
  la auditoría); hoy solo hay prueba unitaria.
- Enviar `window.onerror` a la API (también en la auditoría, fuera del paso).

## Bases de prueba

`coco_e2e_webh_test` (api e2e) y `coco_e2e_webh_pw_test` (Playwright), locales.

## R-bundle

- OpenFeature pasa a `shared/api/flags-engine.ts`, cargado con `import()` tras el primer pintado; `useFlag` lee apagado hasta que llega. Bundle inicial 200.37 → 193.24 kB gz, presupuesto sin tocar.
- `flags.dom.test.tsx` falla si otro archivo importa `@openfeature/` o `flags-engine` de forma estática. Bases: `coco_e2e_bnd_test` y `coco_e2e_bndpw_test`.
