import { Module } from '@nestjs/common';

import { AccountsController } from './accounts.controller';
import { AccountsRepository } from './accounts.repository';
import { AccountsService } from './accounts.service';

@Module({
  controllers: [AccountsController],
  providers: [AccountsService, AccountsRepository],
  // Other modules use accounts through its service only (CONTRIBUTING.md).
  exports: [AccountsService],
})
export class AccountsModule {}
