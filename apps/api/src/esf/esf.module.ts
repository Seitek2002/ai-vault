import { Module } from '@nestjs/common';
import { EsfService } from './esf.service';
import { EsfController } from './esf.controller';
import { EsfPortalClient } from './esf-portal.client';
import { EsfPdfService } from './esf-pdf';
import { EsfScheduler } from './esf.scheduler';

@Module({
  providers: [EsfService, EsfPortalClient, EsfPdfService, EsfScheduler],
  controllers: [EsfController],
  exports: [EsfService],
})
export class EsfModule {}
