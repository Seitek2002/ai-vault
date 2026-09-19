import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Permission } from '../common/permissions';
import { CurrentOrgId, CurrentUser, type JwtPayload } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/permissions.decorator';
import { EsfService } from './esf.service';
import { AttachEsfDto, CheckEsfConnectionDto, ListEsfDto } from './dto/esf.dto';

@Controller('esf')
export class EsfController {
  constructor(private service: EsfService) {}

  @Get('invoices')
  list(@CurrentOrgId() organizationId: string, @Query() query: ListEsfDto) {
    return this.service.list(organizationId, {
      ...(query.unmatchedOnly !== undefined ? { unmatchedOnly: query.unmatchedOnly } : {}),
      ...(query.year !== undefined ? { year: query.year } : {}),
      ...(query.month !== undefined ? { month: query.month } : {}),
    });
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
}
