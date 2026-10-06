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

/** How many files are accepted at once. Eight is the batch's record. */
const MAX_FILES_PER_UPLOAD = 10;

/**
 * A transaction's receipts: the document that proves the payment happened.
 *
 * They hang from `transactions/:id` and not from a route of their own on
 * purpose. A receipt means nothing alone, and the route forces naming the
 * transaction in every request: the ownership check gets two anchors instead
 * of one.
 *
 * The session guard is GLOBAL (`JwtAuthGuard` in `app.module`), so without a
 * token this answers 401 before getting here. Repeating it is neither needed
 * nor wise: an annotation that can be forgotten is one that some day is.
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
   * Uploads one or several receipts.
   *
   * The files go to MEMORY and not to disk. Two reasons: the processing —grey
   * and compression— works on the buffer anyway, and a temporary file on disk
   * is somebody's receipt lying outside the private store, even if only for a
   * second.
   *
   * The size limit is declared TWICE on purpose: here multer cuts it before
   * reading the whole body —which is what protects memory— and the service
   * checks again to give a message that says which file it was.
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
    // With no files in the request, multer does not even leave an empty array.
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
      // `inline`: the modal's viewer shows it, it does not download it. The name
      // is quoted and encoded because it has spaces, accents and parentheses.
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      // Without this, a file uploaded with the wrong type could be read as
      // HTML and run in the app's origin.
      'X-Content-Type-Options': 'nosniff',
      // A receipt is kept in no shared cache. `private` keeps it out of
      // proxies; `no-store` also out of the browser's disk.
      'Cache-Control': 'private, no-store',
      // The PDF is shown in an iframe of the app itself and nothing else.
      // Without this, the file can be embedded by any site with the link.
      'Content-Security-Policy': "default-src 'none'; object-src 'self'; frame-ancestors 'self'",
    });

    return new StreamableFile(stream);
  }
}
