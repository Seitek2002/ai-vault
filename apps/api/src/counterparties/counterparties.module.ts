import { Module } from '@nestjs/common';
import { CounterpartiesService } from './counterparties.service';
import { CounterpartiesController } from './counterparties.controller';

@Module({
  providers: [CounterpartiesService],
  controllers: [CounterpartiesController],
})
export class CounterpartiesModule {}
