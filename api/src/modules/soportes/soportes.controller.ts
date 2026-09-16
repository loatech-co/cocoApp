import { Controller, Get, Param, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { SoportesService, type SoporteView } from './soportes.service';

/**
 * Los soportes de un movimiento: el recibo que prueba que ese pago existió.
 *
 * Cuelgan de `transactions/:id` y no de una ruta suya a propósito. Un soporte
 * no significa nada solo, y la ruta obliga a nombrar el movimiento en cada
 * petición: la comprobación de propiedad tiene así dos anclas en vez de una.
 *
 * El guardia de sesión es GLOBAL (`JwtAuthGuard` en `app.module`), así que sin
 * token esto responde 401 antes de llegar aquí. No hace falta —ni conviene—
 * repetirlo: una anotación que se puede olvidar es una anotación que un día se
 * olvida.
 */
@Controller('transactions')
export class SoportesController {
  constructor(private readonly soportes: SoportesService) {}

  @Get(':id/soportes')
  listar(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
  ): Promise<SoporteView[]> {
    return this.soportes.listar(user.id, id);
  }

  @Get(':id/soportes/:soporteId')
  async descargar(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
    @Param('soporteId', ParseBigIntPipe) soporteId: bigint,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { flujo, nombre, mime, tamano } = await this.soportes.descargar(user.id, id, soporteId);

    res.set({
      'Content-Type': mime,
      'Content-Length': String(tamano),
      // `inline`: el visor del modal lo enseña, no lo descarga. El nombre va
      // entre comillas y codificado porque lleva espacios, tildes y paréntesis.
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(nombre)}`,
      // Sin esto, un archivo subido con el tipo equivocado podría interpretarse
      // como HTML y ejecutarse en el origen de la aplicación.
      'X-Content-Type-Options': 'nosniff',
      // Un recibo no se guarda en ninguna caché compartida. `private` lo deja
      // fuera de los proxys; `no-store` también fuera del disco del navegador.
      'Cache-Control': 'private, no-store',
      // El PDF se enseña en un iframe de la propia app y nada más. Sin esto,
      // el archivo puede embeberse desde cualquier sitio que tenga el enlace.
      'Content-Security-Policy': "default-src 'none'; object-src 'self'; frame-ancestors 'self'",
    });

    return new StreamableFile(flujo);
  }
}
