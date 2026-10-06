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

import { AccountsService, type Account as AccountBody } from './accounts.service';
import type { CreateAccountDto, UpdateAccountDto } from './dto/account.dto';
import { CreateAccountInput, ListAccountsQuery, UpdateAccountInput } from './dto/v2/accounts.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { ApiAuthenticated, ApiErrors, ApiNoContent } from '../../contract/v1/openapi.decorators';
import { Account } from '../../contract/v2/accounts.response';
import { ApiDataV2 } from '../../contract/v2/openapi.decorators';
import { paginate, type Page } from '../../contract/v2/pagination';
import { defined, type V1Draft } from '../../contract/v2/v1-input';
import { accountV2 } from '../../presenters/v2/accounts.presenter';

function createAccount(input: CreateAccountInput): CreateAccountDto {
  return {
    ...defined<V1Draft<CreateAccountDto>>({
      institution: input.institution,
      last4: input.last4,
      credit_limit: input.creditLimit,
      cutoff_day: input.cutoffDay,
      payment_day: input.paymentDay,
      opening_balance: input.openingBalance,
    }),
    name: input.name,
    type: input.type,
  };
}

function updateAccount(input: UpdateAccountInput): UpdateAccountDto {
  return defined<V1Draft<UpdateAccountDto>>({
    name: input.name,
    type: input.type,
    institution: input.institution,
    last4: input.last4,
    credit_limit: input.creditLimit,
    cutoff_day: input.cutoffDay,
    payment_day: input.paymentDay,
    opening_balance: input.openingBalance,
    is_archived: input.isArchived,
  });
}

/** v2 of the accounts: the same service, its own presenter. */
@ApiAuthenticated()
@Controller({ path: 'accounts', version: '2' })
export class AccountsV2Controller {
  constructor(private readonly accounts: AccountsService) {}

  @Get()
  @ApiDataV2(Account, { isPage: true })
  @ApiErrors(400)
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListAccountsQuery,
  ): Promise<Page<AccountBody>> {
    const accounts = await this.accounts.listar(user.id, query.includeArchived ?? false);
    return paginate(accounts.map(accountV2), query);
  }

  @Get(':id')
  @ApiDataV2(Account)
  @ApiErrors(400, 404)
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
  ): Promise<AccountBody> {
    return accountV2(await this.accounts.obtener(user.id, id));
  }

  @Post()
  @ApiDataV2(Account, { status: 201 })
  @ApiErrors(400, 409, 422)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: CreateAccountInput,
  ): Promise<AccountBody> {
    return accountV2(await this.accounts.crear(user.id, createAccount(input)));
  }

  @Patch(':id')
  @ApiDataV2(Account)
  @ApiErrors(400, 404, 409, 422)
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() input: UpdateAccountInput,
  ): Promise<AccountBody> {
    return accountV2(await this.accounts.actualizar(user.id, id, updateAccount(input)));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContent()
  @ApiErrors(400, 404, 409)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
  ): Promise<void> {
    return this.accounts.eliminar(user.id, id);
  }
}
