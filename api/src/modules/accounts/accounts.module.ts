import { Module } from '@nestjs/common';

import { AccountsRepository } from './accounts.repository';
import { AccountsService } from './accounts.service';
import { AccountsV2Controller } from './accounts.v2.controller';

@Module({
  controllers: [AccountsV2Controller],
  providers: [AccountsService, AccountsRepository],
  // Other modules use accounts through its service only (CONTRIBUTING.md).
  exports: [AccountsService],
})
export class AccountsModule {}
