import { Module } from '@nestjs/common';
import { EsfService } from './esf.service';
import { EsfController } from './esf.controller';
import { EsfPortalClient } from './esf-portal.client';
import { EsfDraftClient } from './esf-draft.client';
import { EsfXmlClient } from './esf-xml.client';
import { EsfPdfService } from './esf-pdf';
import { EsfScheduler } from './esf.scheduler';
import { EsfLinksService } from './esf-links.service';

@Module({
  providers: [EsfService, EsfLinksService, EsfPortalClient, EsfDraftClient, EsfXmlClient, EsfPdfService, EsfScheduler],
  controllers: [EsfController],
  exports: [EsfService],
})
export class EsfModule {}
