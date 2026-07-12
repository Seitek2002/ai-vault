import { Controller, Get, Patch, Body } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { UpdateSettingsDto } from './dto/settings.dto';
import { CurrentOrgId } from '../common/decorators/current-user.decorator';

@Controller('settings')
export class SettingsController {
  constructor(private service: SettingsService) {}

  @Get()
  get(@CurrentOrgId() organizationId: string) {
    return this.service.get(organizationId);
  }

  @Patch()
  update(@CurrentOrgId() organizationId: string, @Body() dto: UpdateSettingsDto) {
    return this.service.update(organizationId, dto);
  }
}
