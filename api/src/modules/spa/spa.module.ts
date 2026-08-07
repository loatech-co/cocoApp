import { Module, type DynamicModule } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { existsSync } from 'node:fs';
import type { ServerResponse } from 'node:http';
import { join, resolve } from 'node:path';

/**
 * Sirve la SPA compilada desde el MISMO proceso que la API.
 *
 * ── Por qué un solo proceso y un solo dominio ───────────────────────────────
 * No es comodidad de despliegue: es lo que sostiene el diseño de la sesión.
 *
 * El refresh token vive en una cookie `SameSite=Strict`, que es lo que
 * neutraliza el CSRF sobre /auth. "Strict" significa que el navegador solo la
 * envía cuando la petición sale del MISMO sitio. Si la API viviera en
 * `api-cocoapp.viteri.me` y la interfaz en `cocoapp.viteri.me`, el navegador
 * las trataría como sitios distintos y no enviaría nunca la cookie — habría
 * que bajar a `SameSite=None`, que es exactamente la protección que se quería.
 *
 * Juntarlos también elimina el CORS: no hay origen cruzado que permitir.
 *
 * En desarrollo esto no se activa: ahí manda el servidor de Vite, con su
 * recarga en caliente, y la API solo atiende /api/v1.
 */
@Module({})
export class SpaModule {
  static forRoot(): DynamicModule {
    const raiz = rutaDeLaSpa();

    // Sin build del frontend, el módulo simplemente no hace nada. Levantar
    // solo la API tiene que seguir siendo posible —es lo que hacen las
    // pruebas e2e— y reventar aquí lo impediría.
    if (!raiz) {
      return { module: SpaModule, imports: [] };
    }

    return {
      module: SpaModule,
      imports: [
        ServeStaticModule.forRoot({
          rootPath: raiz,
          // Cualquier ruta que no sea de la API cae en index.html y la
          // resuelve React Router. Sin esto, recargar en /movimientos daría
          // 404: ese archivo no existe en disco.
          exclude: ['/api/{*ruta}'],
          serveStaticOptions: {
            // Los nombres de los assets llevan hash, así que su contenido es
            // inmutable y se puede cachear un año. index.html no: es lo que
            // apunta a los assets nuevos tras un despliegue.
            maxAge: '1y',
            index: false,
            setHeaders: (respuesta: ServerResponse, ruta: string) => {
              if (ruta.endsWith('index.html')) {
                respuesta.setHeader('Cache-Control', 'no-cache, must-revalidate');
              }
            },
          },
        }),
      ],
    };
  }
}

/**
 * Dónde quedó el build del frontend.
 *
 * Se prueban dos rutas porque el proceso arranca desde sitios distintos según
 * cómo se despliegue: desde `api/dist` en local, o desde la raíz del repo en
 * un despliegue de Hostinger.
 */
function rutaDeLaSpa(): string | null {
  const candidatas = [
    process.env.SPA_DIST_PATH,
    resolve(process.cwd(), 'frontend', 'dist'),
    resolve(__dirname, '..', '..', '..', '..', 'frontend', 'dist'),
  ].filter((ruta): ruta is string => Boolean(ruta));

  return candidatas.find((ruta) => existsSync(join(ruta, 'index.html'))) ?? null;
}
