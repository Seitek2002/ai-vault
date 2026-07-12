import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { TemplatesService } from './templates.service';
import { CreateTemplateDto, UpdateTemplateDto, ListTemplatesDto } from './dto/template.dto';
import { CurrentOrgId } from '../common/decorators/current-user.decorator';

@Controller('templates')
export class TemplatesController {
  constructor(private service: TemplatesService) {}

  @Get()
  findAll(@CurrentOrgId() organizationId: string, @Query() query: ListTemplatesDto) {
    return this.service.findAll(organizationId, query);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentOrgId() organizationId: string) {
    return this.service.findOne(id, organizationId);
  }

  @Post()
  create(@Body() dto: CreateTemplateDto, @CurrentOrgId() organizationId: string) {
    return this.service.create(organizationId, dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTemplateDto,
    @CurrentOrgId() organizationId: string,
  ) {
    return this.service.update(id, organizationId, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentOrgId() organizationId: string) {
    return this.service.remove(id, organizationId);
  }
}
