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
import type { TransactionHistory } from './transactions.domain';
import { TransactionsService } from './transactions.service';
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
import {
  transactionPageV1,
  transactionV1,
  transferV1,
  type TransactionPageV1,
  type TransactionV1,
  type TransferV1,
} from '../../presenters/v1/transactions.presenter';

/** M1 — Transactions. The core: everything else derives from here. */
@ApiAuthenticated()
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactions: TransactionsService) {}

  @Get()
  @ApiData(TransactionResponse, { isArray: true, meta: 'page' })
  @ApiErrors(400)
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListTransactionsQueryDto,
  ): Promise<TransactionPageV1> {
    return transactionPageV1(await this.transactions.list(user.id, query));
  }

  /**
   * Goes before `:id` on purpose: after it, Express would try to read
   * "historia" as an id.
   */
  @Get('historia')
  @ApiData(TransactionHistoryResponse)
  history(@CurrentUser() user: AuthenticatedUser): Promise<TransactionHistory> {
    return this.transactions.history(user.id);
  }

  /**
   * Goes before `:id` on purpose: after it, Express would try to read
   * "transfer" as an id.
   */
  @Post('transfer')
  @ApiData(TransferResponse, { status: 201 })
  @ApiErrors(400, 404, 422)
  async createTransfer(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateTransferDto,
  ): Promise<TransferV1> {
    return transferV1(await this.transactions.createTransfer(user.id, dto));
  }

  @Get(':id')
  @ApiData(TransactionResponse)
  @ApiErrors(400, 404)
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
  ): Promise<TransactionV1> {
    return transactionV1(await this.transactions.get(user.id, id));
  }

  @Post()
  @ApiData(TransactionResponse, { status: 201 })
  @ApiErrors(400, 404, 409, 422)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateTransactionDto,
  ): Promise<TransactionV1> {
    return transactionV1(await this.transactions.create(user.id, dto));
  }

  @Patch(':id')
  @ApiData(TransactionResponse)
  @ApiErrors(400, 404, 409, 422)
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() dto: UpdateTransactionDto,
  ): Promise<TransactionV1> {
    return transactionV1(await this.transactions.update(user.id, id, dto));
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
