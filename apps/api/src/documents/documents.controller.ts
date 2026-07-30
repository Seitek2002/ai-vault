import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { Permission } from '../common/permissions';
import { DocumentsService } from './documents.service';
import { CreateDocumentDto, UpdateDocumentDto, ListDocumentsDto, ReplaceFileDto } from './dto/document.dto';
import { ImportDocumentDto } from './dto/import.dto';
import { CurrentUser, CurrentOrgId, type JwtPayload } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/permissions.decorator';

@Controller('documents')
export class DocumentsController {
  constructor(private service: DocumentsService) {}

  @Get()
  findAll(@CurrentOrgId() organizationId: string, @Query() query: ListDocumentsDto) {
    return this.service.findAll(organizationId, query);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentOrgId() organizationId: string) {
    return this.service.findOne(id, organizationId);
  }

  @Post()
  @RequirePermission(Permission.MANAGE_DOCUMENTS)
  create(@Body() dto: CreateDocumentDto, @CurrentOrgId() organizationId: string, @CurrentUser() user: JwtPayload) {
    return this.service.create(organizationId, user.sub, dto);
  }

  @Patch(':id')
  @RequirePermission(Permission.MANAGE_DOCUMENTS)
  update(@Param('id') id: string, @Body() dto: UpdateDocumentDto, @CurrentOrgId() organizationId: string, @CurrentUser() user: JwtPayload) {
    return this.service.update(id, organizationId, user.sub, dto);
  }

  @Delete(':id')
  @RequirePermission(Permission.MANAGE_DOCUMENTS)
  remove(@Param('id') id: string, @CurrentOrgId() organizationId: string) {
    return this.service.remove(id, organizationId);
  }

  @Post(':id/replace-file')
  @RequirePermission(Permission.MANAGE_DOCUMENTS)
  replaceFile(
    @Param('id') id: string,
    @Body() dto: ReplaceFileDto,
    @CurrentOrgId() organizationId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.replaceFile(id, organizationId, user.sub, dto);
  }

  @Post('import')
  @RequirePermission(Permission.MANAGE_DOCUMENTS)
  importFromFile(@Body() dto: ImportDocumentDto, @CurrentOrgId() organizationId: string, @CurrentUser() user: JwtPayload) {
    return this.service.importFromFile(organizationId, user.sub, dto);
  }
}
