import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { CounterpartiesService } from './counterparties.service';
import { CreateCounterpartyDto, UpdateCounterpartyDto } from './dto/counterparty.dto';
import { CurrentUser, type JwtPayload } from '../common/decorators/current-user.decorator';

@Controller('counterparties')
export class CounterpartiesController {
  constructor(private service: CounterpartiesService) {}

  @Get()
  findAll(@CurrentUser() user: JwtPayload, @Query('search') search?: string) {
    return this.service.findAll(user.organizationId, search);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.findOne(id, user.organizationId);
  }

  @Post()
  create(@Body() dto: CreateCounterpartyDto, @CurrentUser() user: JwtPayload) {
    return this.service.create(user.organizationId, dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCounterpartyDto, @CurrentUser() user: JwtPayload) {
    return this.service.update(id, user.organizationId, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.remove(id, user.organizationId);
  }
}
