import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Res,
  StreamableFile,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOkResponse, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { MAX_UPLOAD_BYTES } from './receipts.optimization';
import { ReceiptsService, type IncomingFile } from './receipts.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import {
  ApiAuthenticated,
  ApiData,
  ApiErrors,
  ApiNoContent,
} from '../../contract/v1/openapi.decorators';
import { ReceiptResponse } from '../../contract/v1/receipts.response';
import { receiptV1, type ReceiptV1 } from '../../presenters/v1/receipts.presenter';

/** Cuántos archivos se aceptan de una vez. Ocho es el récord del lote. */
const MAX_FILES_PER_UPLOAD = 10;

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
// The tag the contract was published with: the swagger plugin derives it from
// the class name, and the web's generated client is split by tag. It goes with
// the published ids (src/openapi/document.ts).
@ApiTags('Soportes')
@ApiAuthenticated()
@Controller('transactions')
export class ReceiptsController {
  constructor(private readonly receipts: ReceiptsService) {}

  @Get(':id/soportes')
  @ApiData(ReceiptResponse, { isArray: true })
  @ApiErrors(400, 404)
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
  ): Promise<ReceiptV1[]> {
    return (await this.receipts.list(user.id, id)).map(receiptV1);
  }

  /**
   * Sube uno o varios soportes.
   *
   * Los archivos van a MEMORIA y no a disco. Dos razones: el tratamiento —gris
   * y compresión— trabaja sobre el búfer de todas formas, y un archivo
   * temporal en disco es un recibo de alguien tirado fuera del almacén
   * privado, aunque sea por un segundo.
   *
   * El límite de tamaño se declara DOS veces a propósito: aquí lo corta multer
   * antes de leer el cuerpo entero —que es lo que protege la memoria— y en el
   * servicio se vuelve a comprobar para dar un mensaje que diga cuál archivo
   * fue.
   */
  @Post(':id/soportes')
  @UseInterceptors(
    FilesInterceptor('archivos', MAX_FILES_PER_UPLOAD, {
      limits: { fileSize: MAX_UPLOAD_BYTES, files: MAX_FILES_PER_UPLOAD },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['archivos'],
      properties: {
        archivos: {
          type: 'array',
          maxItems: MAX_FILES_PER_UPLOAD,
          items: { type: 'string', format: 'binary' },
        },
      },
    },
  })
  @ApiData(ReceiptResponse, {
    status: 201,
    isArray: true,
    description: 'Every receipt of the transaction after the upload.',
  })
  @ApiErrors(400, 404, 413, 415, 503)
  async upload(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
    // Sin archivos en la petición, multer no deja ni el arreglo vacío.
    @UploadedFiles() files: IncomingFile[] | undefined,
  ): Promise<ReceiptV1[]> {
    return (await this.receipts.upload(user.id, id, files ?? [])).map(receiptV1);
  }

  @Delete(':id/soportes/:soporteId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContent()
  @ApiErrors(400, 404, 503)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
    @Param('soporteId', ParseBigIntPipe) receiptId: bigint,
  ): Promise<void> {
    return this.receipts.remove(user.id, id, receiptId);
  }

  @Get(':id/soportes/:soporteId')
  @ApiProduces('application/pdf', 'image/jpeg', 'image/png')
  @ApiOkResponse({
    description: 'The file itself, not wrapped in `{ data, meta }`.',
    schema: { type: 'string', format: 'binary' },
  })
  @ApiErrors(400, 404, 503)
  async download(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
    @Param('soporteId', ParseBigIntPipe) receiptId: bigint,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { stream, fileName, mime, sizeBytes } = await this.receipts.download(
      user.id,
      id,
      receiptId,
    );

    res.set({
      'Content-Type': mime,
      'Content-Length': String(sizeBytes),
      // `inline`: el visor del modal lo enseña, no lo descarga. El nombre va
      // entre comillas y codificado porque lleva espacios, tildes y paréntesis.
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`,
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

    return new StreamableFile(stream);
  }
}
