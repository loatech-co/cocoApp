import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Module,
  Param,
  Patch,
  Post,
} from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { CreateImportDto, UpdateImportRowDto } from './dto/import.dto';
import {
  ImportsService,
  type ImportBatchView,
  type ImportRowView,
} from './imports.service';

/**
 * Importación de movimientos (M4).
 *
 * El flujo completo, y por qué tiene tantos pasos:
 *
 *   1. El NAVEGADOR lee el documento con OCR y lo parsea. El extracto nunca
 *      sale del equipo.
 *   2. `POST /imports` sube solo las filas. El servidor calcula huellas,
 *      señala posibles repetidos y sugiere categorías — las tres cosas exigen
 *      ver el historial completo, que el cliente no tiene.
 *   3. La persona REVISA y corrige. Nada ha tocado sus finanzas todavía.
 *   4. `POST /imports/:id/commit` crea los movimientos, de una vez o ninguno.
 *   5. Si algo salió mal, `POST /imports/:id/undo` los quita todos.
 *
 * El paso 3 no es opcional ni se puede saltar. Un OCR se equivoca, y un
 * movimiento equivocado que entra sin mirar contamina saldos e informes.
 */
@Controller('imports')
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  @Get()
  listar(@CurrentUser() user: AuthenticatedUser): Promise<ImportBatchView[]> {
    return this.imports.listar(user.id);
  }

  @Get(':id')
  obtener(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
  ): Promise<ImportBatchView> {
    return this.imports.obtener(user.id, id);
  }

  @Post()
  crear(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateImportDto,
  ): Promise<ImportBatchView> {
    return this.imports.crear(user.id, dto);
  }

  @Patch(':id/rows/:rowId')
  editarFila(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
    @Param('rowId', ParseBigIntPipe) rowId: bigint,
    @Body() dto: UpdateImportRowDto,
  ): Promise<ImportRowView> {
    return this.imports.editarFila(user.id, id, rowId, dto);
  }

  @Post(':id/commit')
  @HttpCode(HttpStatus.OK)
  confirmar(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
  ): Promise<{ creados: number; lote: ImportBatchView }> {
    return this.imports.confirmar(user.id, id);
  }

  @Post(':id/undo')
  @HttpCode(HttpStatus.OK)
  deshacer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
  ): Promise<{ borrados: number }> {
    return this.imports.deshacer(user.id, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  descartar(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
  ): Promise<void> {
    return this.imports.descartar(user.id, id);
  }
}

@Module({
  controllers: [ImportsController],
  providers: [ImportsService],
  exports: [ImportsService],
})
export class ImportsModule {}
