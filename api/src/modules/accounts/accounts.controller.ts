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

import { AccountsService } from './accounts.service';
import { CreateAccountDto, ListAccountsQueryDto, UpdateAccountDto } from './dto/account.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { AccountResponse } from '../../contract/v1/accounts.response';
import {
  ApiAuthenticated,
  ApiData,
  ApiErrors,
  ApiNoContent,
} from '../../contract/v1/openapi.decorators';
import { accountV1, type AccountV1 } from '../../presenters/v1/accounts.presenter';

/**
 * M3 — Cuentas / medios de pago.
 *
 * El controlador no tiene lógica de negocio: recibe, saca el userId del token
 * y delega. El envelope `{ data, meta }` lo pone el TransformInterceptor global.
 */
@ApiAuthenticated()
@Controller('accounts')
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Get()
  @ApiData(AccountResponse, { isArray: true, meta: 'total' })
  @ApiErrors(400)
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListAccountsQueryDto,
  ): Promise<{ data: AccountV1[]; meta: { total: number } }> {
    const accounts = (await this.accounts.list(user.id, query.include_archived ?? false)).map(
      accountV1,
    );
    return { data: accounts, meta: { total: accounts.length } };
  }

  @Get(':id')
  @ApiData(AccountResponse)
  @ApiErrors(400, 404)
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
  ): Promise<AccountV1> {
    return accountV1(await this.accounts.get(user.id, id));
  }

  @Post()
  @ApiData(AccountResponse, { status: 201 })
  @ApiErrors(400, 409, 422)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateAccountDto,
  ): Promise<AccountV1> {
    return accountV1(await this.accounts.create(user.id, dto));
  }

  @Patch(':id')
  @ApiData(AccountResponse)
  @ApiErrors(400, 404, 409, 422)
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() dto: UpdateAccountDto,
  ): Promise<AccountV1> {
    return accountV1(await this.accounts.update(user.id, id, dto));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContent()
  @ApiErrors(400, 404, 409)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
  ): Promise<void> {
    return this.accounts.remove(user.id, id);
  }
}
