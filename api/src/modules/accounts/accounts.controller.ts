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
import { AccountsService, type AccountView } from './accounts.service';
import { CreateAccountDto, ListAccountsQueryDto, UpdateAccountDto } from './dto/account.dto';

/**
 * M3 — Cuentas / medios de pago.
 *
 * El controlador no tiene lógica de negocio: recibe, saca el userId del token
 * y delega. El envelope `{ data, meta }` lo pone el TransformInterceptor global.
 */
@Controller('accounts')
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Get()
  async listar(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListAccountsQueryDto,
  ): Promise<{ data: AccountView[]; meta: { total: number } }> {
    const cuentas = await this.accounts.listar(user.id, query.include_archived ?? false);
    return { data: cuentas, meta: { total: cuentas.length } };
  }

  @Get(':id')
  obtener(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
  ): Promise<AccountView> {
    return this.accounts.obtener(user.id, id);
  }

  @Post()
  crear(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateAccountDto,
  ): Promise<AccountView> {
    return this.accounts.crear(user.id, dto);
  }

  @Patch(':id')
  actualizar(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() dto: UpdateAccountDto,
  ): Promise<AccountView> {
    return this.accounts.actualizar(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  eliminar(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
  ): Promise<void> {
    return this.accounts.eliminar(user.id, id);
  }
}
