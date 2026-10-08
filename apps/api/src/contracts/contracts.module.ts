import { Module } from '@nestjs/common';
import { ContractsService } from './contracts.service';
import { ContractsController } from './contracts.controller';
import { ContractHistoryService } from './contract-history.service';

@Module({
  providers: [ContractsService, ContractHistoryService],
  controllers: [ContractsController],
  exports: [ContractsService],
})
export class ContractsModule {}
