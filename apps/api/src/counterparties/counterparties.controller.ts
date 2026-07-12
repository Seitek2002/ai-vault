import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { CounterpartiesService } from './counterparties.service';
import { CreateCounterpartyDto, UpdateCounterpartyDto } from './dto/counterparty.dto';
import { CurrentOrgId } from '../common/decorators/current-user.decorator';

@Controller('counterparties')
export class CounterpartiesController {
  constructor(private service: CounterpartiesService) {}

  @Get()
  findAll(@CurrentOrgId() organizationId: string, @Query('search') search?: string) {
    return this.service.findAll(organizationId, search);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentOrgId() organizationId: string) {
    return this.service.findOne(id, organizationId);
  }

  @Post()
  create(@Body() dto: CreateCounterpartyDto, @CurrentOrgId() organizationId: string) {
    return this.service.create(organizationId, dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCounterpartyDto, @CurrentOrgId() organizationId: string) {
    return this.service.update(id, organizationId, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentOrgId() organizationId: string) {
    return this.service.remove(id, organizationId);
  }
}
