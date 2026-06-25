import { Controller, Get, Patch, Body } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { UpdateSettingsDto } from './dto/settings.dto';
import { CurrentUser, type JwtPayload } from '../common/decorators/current-user.decorator';

@Controller('settings')
export class SettingsController {
  constructor(private service: SettingsService) {}

  @Get()
  get(@CurrentUser() user: JwtPayload) {
    return this.service.get(user.organizationId);
  }

  @Patch()
  update(@CurrentUser() user: JwtPayload, @Body() dto: UpdateSettingsDto) {
    return this.service.update(user.organizationId, dto);
  }
}
