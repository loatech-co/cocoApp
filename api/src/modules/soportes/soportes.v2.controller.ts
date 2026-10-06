import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOkResponse, ApiProduces } from '@nestjs/swagger';
import type { Response } from 'express';

import { TAMANO_MAXIMO } from './soportes.optimizacion';
import {
  SoportesService,
  type ArchivoSubido,
  type Receipt as ReceiptBody,
} from './soportes.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { Receipt } from '../../contract/v2/misc.response';
import {
  ApiAuthenticated,
  ApiErrors,
  ApiNoContent,
  ApiDataV2,
} from '../../contract/v2/openapi.decorators';
import { PageQuery } from '../../contract/v2/page.dto';
import { paginate, type Page } from '../../contract/v2/pagination';
import { receiptV2 } from '../../presenters/v2/receipts.presenter';

/** The same cap as v1: files per upload. */
const MAX_PER_UPLOAD = 10;

/** The multipart field the files travel in (v1 called it `archivos`). */
const FILES_FIELD = 'files';

/**
 * v2 of a transaction's receipts (v1 `soportes`): the same service,
 * translated at the edge. The download is the file itself, as in v1.
 */
@ApiAuthenticated()
@Controller({ path: 'transactions', version: '2' })
export class SoportesV2Controller {
  constructor(private readonly soportes: SoportesService) {}

  @Get(':id/receipts')
  @ApiDataV2(Receipt, { isPage: true })
  @ApiErrors(400, 404)
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
    @Query() query: PageQuery,
  ): Promise<Page<ReceiptBody>> {
    return paginate((await this.soportes.listar(user.id, id)).map(receiptV2), query);
  }

  @Post(':id/receipts')
  @UseInterceptors(
    FilesInterceptor(FILES_FIELD, MAX_PER_UPLOAD, {
      limits: { fileSize: TAMANO_MAXIMO, files: MAX_PER_UPLOAD },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: [FILES_FIELD],
      properties: {
        [FILES_FIELD]: {
          type: 'array',
          maxItems: MAX_PER_UPLOAD,
          items: { type: 'string', format: 'binary' },
        },
      },
    },
  })
  @ApiDataV2(Receipt, {
    status: 201,
    isPage: true,
    description: 'The first page of the transaction’s receipts after the upload.',
  })
  @ApiErrors(400, 404, 413, 415, 503)
  async upload(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
    @UploadedFiles() files: ArchivoSubido[] | undefined,
  ): Promise<Page<ReceiptBody>> {
    return paginate((await this.soportes.subir(user.id, id, files ?? [])).map(receiptV2), {});
  }

  @Delete(':id/receipts/:receiptId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContent()
  @ApiErrors(400, 404, 503)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
    @Param('receiptId', ParseBigIntPipe) receiptId: bigint,
  ): Promise<void> {
    return this.soportes.eliminar(user.id, id, receiptId);
  }

  /** The same headers as v1: the file opens inline, is never cached and runs nothing. */
  @Get(':id/receipts/:receiptId')
  @ApiProduces('application/pdf', 'image/jpeg', 'image/png')
  @ApiOkResponse({
    description: 'The file itself, not wrapped in `{ data, meta }`.',
    schema: { type: 'string', format: 'binary' },
  })
  @ApiErrors(400, 404, 503)
  async download(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
    @Param('receiptId', ParseBigIntPipe) receiptId: bigint,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { flujo, nombre, mime, tamano } = await this.soportes.descargar(user.id, id, receiptId);
    res.set({
      'Content-Type': mime,
      'Content-Length': String(tamano),
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(nombre)}`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
      'Content-Security-Policy': "default-src 'none'; object-src 'self'; frame-ancestors 'self'",
    });
    return new StreamableFile(flujo);
  }
}
