import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import {
  CreateTransactionDto,
  CreateTransferDto,
  ListTransactionsQueryDto,
  UpdateTransactionDto,
} from './dto/transaction.dto';
import { TransactionsService, type TransactionView } from './transactions.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import {
  ApiAuthenticated,
  ApiData,
  ApiErrors,
  ApiNoContent,
} from '../../contract/v1/openapi.decorators';
import {
  TransactionHistoryResponse,
  TransactionResponse,
  TransferResponse,
} from '../../contract/v1/transactions.response';

/** M1 — Movimientos. El núcleo: todo lo demás se deriva de aquí. */
@ApiAuthenticated()
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactions: TransactionsService) {}

  @Get()
  @ApiData(TransactionResponse, { isArray: true, meta: 'page' })
  @ApiErrors(400)
  listar(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListTransactionsQueryDto,
  ): Promise<{ data: TransactionView[]; meta: { page: number; per_page: number; total: number } }> {
    return this.transactions.listar(user.id, query);
  }

  /**
   * Va antes de `:id` a propósito: si estuviera después, Express intentaría
   * interpretar "historia" como un identificador.
   */
  @Get('historia')
  @ApiData(TransactionHistoryResponse)
  historia(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ first: string | null; last: string | null }> {
    return this.transactions.historia(user.id);
  }

  /**
   * Va antes de `:id` a propósito: si estuviera después, Express intentaría
   * interpretar "transfer" como un identificador.
   */
  @Post('transfer')
  @ApiData(TransferResponse, { status: 201 })
  @ApiErrors(400, 404, 422)
  crearTransferencia(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateTransferDto,
  ): Promise<{ transfer_group_id: string; legs: TransactionView[] }> {
    return this.transactions.crearTransferencia(user.id, dto);
  }

  @Get(':id')
  @ApiData(TransactionResponse)
  @ApiErrors(400, 404)
  obtener(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
  ): Promise<TransactionView> {
    return this.transactions.obtener(user.id, id);
  }

  @Post()
  @ApiData(TransactionResponse, { status: 201 })
  @ApiErrors(400, 404, 409, 422)
  crear(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateTransactionDto,
  ): Promise<TransactionView> {
    return this.transactions.crear(user.id, dto);
  }

  @Patch(':id')
  @ApiData(TransactionResponse)
  @ApiErrors(400, 404, 409, 422)
  actualizar(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() dto: UpdateTransactionDto,
  ): Promise<TransactionView> {
    return this.transactions.actualizar(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContent()
  @ApiErrors(400, 404)
  eliminar(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
  ): Promise<void> {
    return this.transactions.eliminar(user.id, id);
  }
}
