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
  CreateTransactionInput,
  CreateTransferInput,
  ListTransactionsQuery,
  UpdateTransactionInput,
} from './dto/v2/transactions.dto';
import { TransactionsService, type TransactionView } from './transactions.service';
import {
  createTransaction,
  createTransfer,
  listTransactions,
  updateTransaction,
} from './transactions.v2.mapper';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { ApiAuthenticated, ApiErrors, ApiNoContent } from '../../contract/v1/openapi.decorators';
import { ApiDataV2 } from '../../contract/v2/openapi.decorators';
import type { Page } from '../../contract/v2/pagination';
import { toV2, type ToV2 } from '../../contract/v2/to-v2';
import { Transaction, TransactionHistory, Transfer } from '../../contract/v2/transactions.response';

/** v2 of the transactions: the same service, translated at the edge. */
@ApiAuthenticated()
@Controller({ path: 'transactions', version: '2' })
export class TransactionsV2Controller {
  constructor(private readonly transactions: TransactionsService) {}

  @Get()
  @ApiDataV2(Transaction, { isPage: true })
  @ApiErrors(400)
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListTransactionsQuery,
  ): Promise<Page<ToV2<TransactionView>>> {
    return toV2(await this.transactions.listar(user.id, listTransactions(query)));
  }

  /** Before `:id`, or Express would read "history" as an id. */
  @Get('history')
  @ApiDataV2(TransactionHistory)
  history(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ first: string | null; last: string | null }> {
    return this.transactions.historia(user.id);
  }

  /** Before `:id`, for the same reason. */
  @Post('transfer')
  @ApiDataV2(Transfer, { status: 201 })
  @ApiErrors(400, 404, 422)
  async createTransfer(
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: CreateTransferInput,
  ): Promise<ToV2<{ transfer_group_id: string; legs: TransactionView[] }>> {
    return toV2(await this.transactions.crearTransferencia(user.id, createTransfer(input)));
  }

  @Get(':id')
  @ApiDataV2(Transaction)
  @ApiErrors(400, 404)
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
  ): Promise<ToV2<TransactionView>> {
    return toV2(await this.transactions.obtener(user.id, id));
  }

  @Post()
  @ApiDataV2(Transaction, { status: 201 })
  @ApiErrors(400, 404, 409, 422)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: CreateTransactionInput,
  ): Promise<ToV2<TransactionView>> {
    return toV2(await this.transactions.crear(user.id, createTransaction(input)));
  }

  @Patch(':id')
  @ApiDataV2(Transaction)
  @ApiErrors(400, 404, 409, 422)
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() input: UpdateTransactionInput,
  ): Promise<ToV2<TransactionView>> {
    return toV2(await this.transactions.actualizar(user.id, id, updateTransaction(input)));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContent()
  @ApiErrors(400, 404)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
  ): Promise<void> {
    return this.transactions.eliminar(user.id, id);
  }
}
