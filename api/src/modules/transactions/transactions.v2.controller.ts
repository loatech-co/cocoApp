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
import type {
  Transaction as TransactionBody,
  TransactionHistory as HistoryBody,
  TransactionPage,
  Transfer as TransferBody,
} from './transactions.domain';
import { TransactionsService } from './transactions.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import {
  ApiAuthenticated,
  ApiErrors,
  ApiNoContent,
  ApiDataV2,
} from '../../contract/v2/openapi.decorators';
import {
  Transaction,
  TransactionHistory,
  TransactionPageMeta,
  Transfer,
} from '../../contract/v2/transactions.response';
import {
  transactionPageV2,
  transactionV2,
  transferV2,
} from '../../presenters/v2/transactions.presenter';

/** v2 of the transactions: the same service, its own presenter. */
@ApiAuthenticated()
@Controller({ path: 'transactions', version: '2' })
export class TransactionsV2Controller {
  constructor(private readonly transactions: TransactionsService) {}

  @Get()
  @ApiDataV2(Transaction, { isPage: true, pageMeta: TransactionPageMeta })
  @ApiErrors(400)
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListTransactionsQuery,
  ): Promise<TransactionPage> {
    return transactionPageV2(await this.transactions.list(user.id, query));
  }

  /** Before `:id`, or Express would read "history" as an id. */
  @Get('history')
  @ApiDataV2(TransactionHistory)
  history(@CurrentUser() user: AuthenticatedUser): Promise<HistoryBody> {
    return this.transactions.history(user.id);
  }

  /** Before `:id`, for the same reason. */
  @Post('transfer')
  @ApiDataV2(Transfer, { status: 201 })
  @ApiErrors(400, 404, 422)
  async createTransfer(
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: CreateTransferInput,
  ): Promise<TransferBody> {
    return transferV2(await this.transactions.createTransfer(user.id, input));
  }

  @Get(':id')
  @ApiDataV2(Transaction)
  @ApiErrors(400, 404)
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
  ): Promise<TransactionBody> {
    return transactionV2(await this.transactions.get(user.id, id));
  }

  @Post()
  @ApiDataV2(Transaction, { status: 201 })
  @ApiErrors(400, 404, 409, 422)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: CreateTransactionInput,
  ): Promise<TransactionBody> {
    return transactionV2(await this.transactions.create(user.id, input));
  }

  @Patch(':id')
  @ApiDataV2(Transaction)
  @ApiErrors(400, 404, 409, 422)
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() input: UpdateTransactionInput,
  ): Promise<TransactionBody> {
    return transactionV2(await this.transactions.update(user.id, id, input));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContent()
  @ApiErrors(400, 404)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
  ): Promise<void> {
    return this.transactions.remove(user.id, id);
  }
}
