import { Module } from '@nestjs/common';
import { SoportesModule } from '../soportes/soportes.module';
import { TagsModule } from '../tags/tags.module';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';

@Module({
  imports: [TagsModule, SoportesModule],
  controllers: [TransactionsController],
  providers: [TransactionsService],
  exports: [TransactionsService],
})
export class TransactionsModule {}
