import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { SettlementsService } from './settlements.service';
import {
  CompleteStepDto,
  CreatePaymentDto,
  GenerateSettlementsDto,
  ListSettlementsDto,
  UpdateSettlementDto,
} from './dto/settlement.dto';
import { CurrentOrgId, CurrentUser, type JwtPayload } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/permissions.decorator';
import { Permission } from '../common/permissions';

@Controller('settlements')
export class SettlementsController {
  constructor(private service: SettlementsService) {}

  @Get()
  findAll(@CurrentOrgId() organizationId: string, @Query() query: ListSettlementsDto) {
    return this.service.findAll(organizationId, query);
  }

  @Get('by-counterparty/:counterpartyId')
  findByCounterparty(
    @Param('counterpartyId') counterpartyId: string,
    @CurrentOrgId() organizationId: string,
  ) {
    return this.service.findByCounterparty(organizationId, counterpartyId);
  }

  @Post('generate')
  @RequirePermission(Permission.MANAGE_DOCUMENTS)
  generate(
    @Body() dto: GenerateSettlementsDto,
    @CurrentOrgId() organizationId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.generate(organizationId, user.sub, dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentOrgId() organizationId: string) {
    return this.service.findOne(id, organizationId);
  }

  @Patch(':id')
  @RequirePermission(Permission.MANAGE_DOCUMENTS)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSettlementDto,
    @CurrentOrgId() organizationId: string,
  ) {
    return this.service.update(id, organizationId, dto);
  }

  @Delete(':id')
  @RequirePermission(Permission.MANAGE_DOCUMENTS)
  remove(@Param('id') id: string, @CurrentOrgId() organizationId: string) {
    return this.service.remove(id, organizationId);
  }

  @Post(':id/steps/:stepId/complete')
  @RequirePermission(Permission.MANAGE_DOCUMENTS)
  completeStep(
    @Param('id') id: string,
    @Param('stepId') stepId: string,
    @Body() dto: CompleteStepDto,
    @CurrentOrgId() organizationId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.completeStep(id, stepId, organizationId, user.sub, dto);
  }

  @Post(':id/steps/:stepId/reopen')
  @RequirePermission(Permission.MANAGE_DOCUMENTS)
  reopenStep(
    @Param('id') id: string,
    @Param('stepId') stepId: string,
    @CurrentOrgId() organizationId: string,
  ) {
    return this.service.reopenStep(id, stepId, organizationId);
  }

  @Post(':id/payments')
  @RequirePermission(Permission.MANAGE_DOCUMENTS)
  addPayment(
    @Param('id') id: string,
    @Body() dto: CreatePaymentDto,
    @CurrentOrgId() organizationId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.addPayment(id, organizationId, user.sub, dto);
  }

  @Delete(':id/payments/:paymentId')
  @RequirePermission(Permission.MANAGE_DOCUMENTS)
  removePayment(
    @Param('id') id: string,
    @Param('paymentId') paymentId: string,
    @CurrentOrgId() organizationId: string,
  ) {
    return this.service.removePayment(id, paymentId, organizationId);
  }
}
