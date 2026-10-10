import { Module, type DynamicModule } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { existsSync } from 'node:fs';
import type { ServerResponse } from 'node:http';
import { join, resolve } from 'node:path';

/**
 * Serves the built SPA from the SAME process as the API.
 *
 * ── Why one process and one domain ───────────────────────────────────────────
 * It is not deployment convenience: it is what holds up the session design.
 *
 * The refresh token lives in a `SameSite=Strict` cookie, which is what
 * neutralises CSRF on /auth. "Strict" means the browser only sends it when the
 * request comes from the SAME site. If the API lived on an `api-` subdomain
 * and the interface on another one, the browser would treat them as different sites and never send the cookie — it
 * would have to drop to `SameSite=None`, which is exactly the protection that
 * was wanted.
 *
 * Putting them together also removes CORS: there is no cross origin to allow.
 *
 * In development this does not switch on: the Vite server is in charge there,
 * with hot reload, and the API only serves /api/v2.
 */
/**
 * Paths that never fall back to index.html. A real file under them is still
 * served (the exclusion only skips the fallback); anything else reaches the
 * router and gets the API's 404 problem document.
 *
 * - `/api`: the API.
 * - `/problems`: the `type` URIs of the problem documents. Answering them with
 *   the SPA said "200, this exists" for a page that does not.
 * - `/openapi.v2.json`: the contract is not published (see main.ts).
 * - `/assets`: a missing hashed bundle after a deployment must fail as a 404,
 *   not load HTML as JavaScript.
 */
const NOT_SPA_ROUTES = [
  '/api{/*rest}',
  '/problems{/*rest}',
  '/openapi.v2.json',
  '/assets{/*rest}',
] as const;

@Module({})
export class SpaModule {
  static forRoot(): DynamicModule {
    const root = spaRoot();

    // Without a frontend build, the module simply does nothing. Starting the
    // API alone has to stay possible —it is what the e2e tests do— and
    // failing here would prevent it.
    if (!root) {
      return { module: SpaModule, imports: [] };
    }

    return {
      module: SpaModule,
      imports: [
        ServeStaticModule.forRoot({
          rootPath: root,
          // Any path that is not the API's falls back to index.html and React
          // Router resolves it. Without this, reloading on /movimientos would
          // give a 404: that file does not exist on disk.
          exclude: [...NOT_SPA_ROUTES],
          serveStaticOptions: {
            // Asset names carry a hash, so their content is immutable and can
            // be cached for a year. Not index.html: it is what points at the
            // new assets after a deployment.
            maxAge: '1y',
            index: false,
            setHeaders: (response: ServerResponse, filePath: string) => {
              if (filePath.endsWith('index.html')) {
                response.setHeader('Cache-Control', 'no-cache, must-revalidate');
              }
            },
          },
        }),
      ],
    };
  }
}

/**
 * Where the frontend build ended up.
 *
 * Two paths are tried because the process starts from different places
 * depending on how it is deployed: from `api/dist` locally, or from the repo
 * root in a Hostinger deployment.
 */
function spaRoot(): string | null {
  const candidates = [
    process.env.SPA_DIST_PATH,
    resolve(process.cwd(), 'frontend', 'dist'),
    resolve(__dirname, '..', '..', '..', '..', 'frontend', 'dist'),
  ].filter((filePath): filePath is string => Boolean(filePath));

  return candidates.find((filePath) => existsSync(join(filePath, 'index.html'))) ?? null;
}
