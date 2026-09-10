import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Permission } from '../common/permissions';
import { ContractsService } from './contracts.service';
import { CreateContractDto, ListContractsDto, UpdateContractDto } from './dto/contract.dto';
import { CurrentOrgId } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/permissions.decorator';

@Controller('contracts')
export class ContractsController {
  constructor(private service: ContractsService) {}

  @Get()
  findAll(@CurrentOrgId() organizationId: string, @Query() query: ListContractsDto) {
    return this.service.findAll(organizationId, query);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentOrgId() organizationId: string) {
    return this.service.findOne(id, organizationId);
  }

  @Post()
  @RequirePermission(Permission.MANAGE_COMPANIES)
  create(@Body() dto: CreateContractDto, @CurrentOrgId() organizationId: string) {
    return this.service.create(organizationId, dto);
  }

  @Patch(':id')
  @RequirePermission(Permission.MANAGE_COMPANIES)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateContractDto,
    @CurrentOrgId() organizationId: string,
  ) {
    return this.service.update(id, organizationId, dto);
  }

  @Delete(':id')
  @RequirePermission(Permission.MANAGE_COMPANIES)
  remove(@Param('id') id: string, @CurrentOrgId() organizationId: string) {
    return this.service.remove(id, organizationId);
  }
}
