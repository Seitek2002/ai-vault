import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { DocumentsService } from './documents.service';
import { CreateDocumentDto, UpdateDocumentDto, ListDocumentsDto, ReplaceFileDto } from './dto/document.dto';
import { ImportDocumentDto } from './dto/import.dto';
import { CurrentUser, type JwtPayload } from '../common/decorators/current-user.decorator';

@Controller('documents')
export class DocumentsController {
  constructor(private service: DocumentsService) {}

  @Get()
  findAll(@CurrentUser() user: JwtPayload, @Query() query: ListDocumentsDto) {
    return this.service.findAll(user.organizationId, query);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.findOne(id, user.organizationId);
  }

  @Post()
  create(@Body() dto: CreateDocumentDto, @CurrentUser() user: JwtPayload) {
    return this.service.create(user.organizationId, user.sub, dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateDocumentDto, @CurrentUser() user: JwtPayload) {
    return this.service.update(id, user.organizationId, user.sub, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.remove(id, user.organizationId);
  }

  @Post(':id/replace-file')
  replaceFile(
    @Param('id') id: string,
    @Body() dto: ReplaceFileDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.replaceFile(id, user.organizationId, user.sub, dto);
  }

  @Post('import')
  importFromFile(@Body() dto: ImportDocumentDto, @CurrentUser() user: JwtPayload) {
    return this.service.importFromFile(user.organizationId, user.sub, dto);
  }
}
