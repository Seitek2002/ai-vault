import { Controller, Get, Patch, Post, Body, Req, BadRequestException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { Permission } from '../common/permissions';
import { SettingsService } from './settings.service';
import { UpdateSettingsDto } from './dto/settings.dto';
import { CurrentOrgId } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/permissions.decorator';

@Controller('settings')
export class SettingsController {
  constructor(private service: SettingsService) {}

  @Get()
  get(@CurrentOrgId() organizationId: string) {
    return this.service.get(organizationId);
  }

  @Patch()
  @RequirePermission(Permission.MANAGE_SETTINGS)
  update(@CurrentOrgId() organizationId: string, @Body() dto: UpdateSettingsDto) {
    return this.service.update(organizationId, dto);
  }

  @Post('logo')
  @RequirePermission(Permission.MANAGE_SETTINGS)
  async uploadLogo(@Req() req: FastifyRequest, @CurrentOrgId() organizationId: string) {
    const file = await (
      req as FastifyRequest & { file: () => Promise<{ mimetype: string; toBuffer: () => Promise<Buffer> } | undefined> }
    ).file();
    if (!file) throw new BadRequestException('No file provided');
    return this.service.uploadLogo(organizationId, { buffer: await file.toBuffer(), mimeType: file.mimetype });
  }
}
