import { Module } from '@nestjs/common';
import { DocumentCategoriesService } from './document-categories.service';
import { DocumentCategoriesController } from './document-categories.controller';

@Module({
  providers: [DocumentCategoriesService],
  controllers: [DocumentCategoriesController],
})
export class DocumentCategoriesModule {}
