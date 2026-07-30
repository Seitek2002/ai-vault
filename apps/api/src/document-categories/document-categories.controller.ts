import { Controller, Get, Post, Patch, Delete, Body, Param } from '@nestjs/common';
import { DocumentCategoriesService } from './document-categories.service';
import { CreateDocumentCategoryDto, UpdateDocumentCategoryDto } from './dto/document-category.dto';
import { CurrentOrgId } from '../common/decorators/current-user.decorator';

@Controller('document-categories')
export class DocumentCategoriesController {
  constructor(private service: DocumentCategoriesService) {}

  @Get()
  findAll(@CurrentOrgId() organizationId: string) {
    return this.service.findAll(organizationId);
  }

  @Post()
  create(@Body() dto: CreateDocumentCategoryDto, @CurrentOrgId() organizationId: string) {
    return this.service.create(organizationId, dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateDocumentCategoryDto, @CurrentOrgId() organizationId: string) {
    return this.service.update(id, organizationId, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentOrgId() organizationId: string) {
    return this.service.remove(id, organizationId);
  }
}
