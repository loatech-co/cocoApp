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

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import {
  CreateTransactionDto,
  CreateTransferDto,
  ListTransactionsQueryDto,
  UpdateTransactionDto,
} from './dto/transaction.dto';
import { TransactionsService, type TransactionView } from './transactions.service';

/** M1 — Movimientos. El núcleo: todo lo demás se deriva de aquí. */
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactions: TransactionsService) {}

  @Get()
  listar(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListTransactionsQueryDto,
  ): Promise<{ data: TransactionView[]; meta: { page: number; per_page: number; total: number } }> {
    return this.transactions.listar(user.id, query);
  }

  /**
   * Va antes de `:id` a propósito: si estuviera después, Express intentaría
   * interpretar "transfer" como un identificador.
   */
  @Post('transfer')
  crearTransferencia(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateTransferDto,
  ): Promise<{ transfer_group_id: string; legs: TransactionView[] }> {
    return this.transactions.crearTransferencia(user.id, dto);
  }

  @Get(':id')
  obtener(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
  ): Promise<TransactionView> {
    return this.transactions.obtener(user.id, id);
  }

  @Post()
  crear(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateTransactionDto,
  ): Promise<TransactionView> {
    return this.transactions.crear(user.id, dto);
  }

  @Patch(':id')
  actualizar(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() dto: UpdateTransactionDto,
  ): Promise<TransactionView> {
    return this.transactions.actualizar(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  eliminar(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
  ): Promise<void> {
    return this.transactions.eliminar(user.id, id);
  }
}
