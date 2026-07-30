import { Controller, Get, Post, Patch, Delete, Body, Param } from '@nestjs/common';
import { Permission } from '../common/permissions';
import { PositionsService } from './positions.service';
import { CreatePositionDto, UpdatePositionDto } from './dto/position.dto';
import { CurrentOrgId } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/permissions.decorator';

@Controller('positions')
export class PositionsController {
  constructor(private service: PositionsService) {}

  @Get()
  findAll(@CurrentOrgId() organizationId: string) {
    return this.service.findAll(organizationId);
  }

  @Post()
  @RequirePermission(Permission.MANAGE_POSITIONS)
  create(@Body() dto: CreatePositionDto, @CurrentOrgId() organizationId: string) {
    return this.service.create(organizationId, dto);
  }

  @Patch(':id')
  @RequirePermission(Permission.MANAGE_POSITIONS)
  update(@Param('id') id: string, @Body() dto: UpdatePositionDto, @CurrentOrgId() organizationId: string) {
    return this.service.update(id, organizationId, dto);
  }

  @Delete(':id')
  @RequirePermission(Permission.MANAGE_POSITIONS)
  remove(@Param('id') id: string, @CurrentOrgId() organizationId: string) {
    return this.service.remove(id, organizationId);
  }
}
