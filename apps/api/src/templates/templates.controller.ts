import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { ExportService } from '../export/export.service';
import { Permission } from '../common/permissions';
import { TemplatesService } from './templates.service';
import { CreateTemplateDto, UpdateTemplateDto, ListTemplatesDto, PreviewTemplateDto } from './dto/template.dto';
import { CurrentOrgId } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/permissions.decorator';

@Controller('templates')
export class TemplatesController {
  constructor(private service: TemplatesService, private exporter: ExportService) {}

  @Post('preview/pdf')
  @RequirePermission(Permission.MANAGE_TEMPLATES)
  async previewDraft(@Body() dto: PreviewTemplateDto, @CurrentOrgId() organizationId: string, @Res() reply: FastifyReply) {
    const { buffer } = await this.exporter.generateDraftTemplatePdf(dto, organizationId);
    return reply.header('Content-Type', 'application/pdf').header('Cache-Control', 'private, no-store').send(buffer);
  }

  @Get(':id/preview/pdf')
  async preview(@Param('id') id: string, @CurrentOrgId() organizationId: string, @Res() reply: FastifyReply) {
    const { buffer } = await this.exporter.generateTemplatePdf(id, organizationId);
    return reply.header('Content-Type', 'application/pdf').header('Cache-Control', 'private, no-store').send(buffer);
  }

  @Get()
  findAll(@CurrentOrgId() organizationId: string, @Query() query: ListTemplatesDto) {
    return this.service.findAll(organizationId, query);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentOrgId() organizationId: string) {
    return this.service.findOne(id, organizationId);
  }

  @Post()
  @RequirePermission(Permission.MANAGE_TEMPLATES)
  create(@Body() dto: CreateTemplateDto, @CurrentOrgId() organizationId: string) {
    return this.service.create(organizationId, dto);
  }

  @Patch(':id')
  @RequirePermission(Permission.MANAGE_TEMPLATES)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTemplateDto,
    @CurrentOrgId() organizationId: string,
  ) {
    return this.service.update(id, organizationId, dto);
  }

  @Delete(':id')
  @RequirePermission(Permission.MANAGE_TEMPLATES)
  remove(@Param('id') id: string, @CurrentOrgId() organizationId: string) {
    return this.service.remove(id, organizationId);
  }
}
