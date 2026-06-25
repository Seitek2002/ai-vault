import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { TemplatesService } from './templates.service';
import { CreateTemplateDto, UpdateTemplateDto, ListTemplatesDto } from './dto/template.dto';
import { CurrentUser, type JwtPayload } from '../common/decorators/current-user.decorator';

@Controller('templates')
export class TemplatesController {
  constructor(private service: TemplatesService) {}

  @Get()
  findAll(@CurrentUser() user: JwtPayload, @Query() query: ListTemplatesDto) {
    return this.service.findAll(user.organizationId, query);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.findOne(id, user.organizationId);
  }

  @Post()
  create(@Body() dto: CreateTemplateDto, @CurrentUser() user: JwtPayload) {
    return this.service.create(user.organizationId, dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTemplateDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.update(id, user.organizationId, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.remove(id, user.organizationId);
  }
}
