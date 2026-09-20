import { Body, Controller, Get, Headers, Param, Post, Query } from '@nestjs/common';
import { Permission } from '../common/permissions';
import { CurrentOrgId, CurrentUser, type JwtPayload } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/permissions.decorator';
import { EsfService } from './esf.service';
import { AttachEsfDto, CheckEsfConnectionDto, ListEsfDto } from './dto/esf.dto';

@Controller('esf')
export class EsfController {
  constructor(private service: EsfService) {}

  @Get('invoices')
  async list(
    @CurrentOrgId() organizationId: string,
    @Query() query: ListEsfDto,
    @Headers('x-esf-hidden-pin') pin?: string,
  ) {
    // PIN идёт заголовком, а не в query — чтобы не оседал в логах прокси.
    if (query.hiddenOnly) await this.service.assertHiddenPin(organizationId, pin);
    return this.service.list(organizationId, {
      ...(query.unmatchedOnly !== undefined ? { unmatchedOnly: query.unmatchedOnly } : {}),
      ...(query.hiddenOnly !== undefined ? { hiddenOnly: query.hiddenOnly } : {}),
      ...(query.year !== undefined ? { year: query.year } : {}),
      ...(query.month !== undefined ? { month: query.month } : {}),
    });
  }

  @Get('invoices/hidden-count')
  async hiddenCount(@CurrentOrgId() organizationId: string) {
    return { count: await this.service.hiddenCount(organizationId) };
  }

  @Post('sync')
  @RequirePermission(Permission.MANAGE_DOCUMENTS)
  sync(@CurrentOrgId() organizationId: string, @CurrentUser() user: JwtPayload) {
    return this.service.sync(organizationId, user.sub);
  }

  /** Проверка логина/пароля до сохранения — пароль нигде не остаётся. */
  @Post('check-connection')
  @RequirePermission(Permission.MANAGE_SETTINGS)
  async checkConnection(@Body() dto: CheckEsfConnectionDto) {
    await this.service.checkConnection(dto.login, dto.password);
    return { ok: true };
  }

  @Post('invoices/:id/attach')
  @RequirePermission(Permission.MANAGE_DOCUMENTS)
  attach(
    @Param('id') id: string,
    @Body() dto: AttachEsfDto,
    @CurrentOrgId() organizationId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.attach(organizationId, user.sub, id, dto.settlementId);
  }

  @Post('invoices/:id/detach')
  @RequirePermission(Permission.MANAGE_DOCUMENTS)
  detach(@Param('id') id: string, @CurrentOrgId() organizationId: string) {
    return this.service.detach(organizationId, id);
  }

  @Post('invoices/:id/hide')
  @RequirePermission(Permission.MANAGE_DOCUMENTS)
  hide(@Param('id') id: string, @CurrentOrgId() organizationId: string) {
    return this.service.setHidden(organizationId, id, true);
  }

  @Post('invoices/:id/unhide')
  @RequirePermission(Permission.MANAGE_DOCUMENTS)
  async unhide(
    @Param('id') id: string,
    @CurrentOrgId() organizationId: string,
    @Headers('x-esf-hidden-pin') pin?: string,
  ) {
    await this.service.assertHiddenPin(organizationId, pin);
    return this.service.setHidden(organizationId, id, false);
  }
}
