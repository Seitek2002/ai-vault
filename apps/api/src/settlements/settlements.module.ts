import { Module } from '@nestjs/common';
import { SettlementsService } from './settlements.service';
import { SettlementsController } from './settlements.controller';
import { SettlementDocsService } from './settlement-docs.service';
import { SettlementsScheduler } from './settlements.scheduler';

@Module({
  providers: [SettlementsService, SettlementDocsService, SettlementsScheduler],
  controllers: [SettlementsController],
  exports: [SettlementsService],
})
export class SettlementsModule {}
