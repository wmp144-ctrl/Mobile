import { Body, Controller, Get, Patch } from '@nestjs/common';
import { PERMISSIONS } from '../../common/permissions';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../users/user.types';
import { UpdateSettingsDto } from './settings.dto';
import { SettingsService } from './settings.service';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.SETTINGS_VIEW)
  get() {
    return this.settings.getAll();
  }

  @Patch()
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  update(@Body() dto: UpdateSettingsDto, @CurrentUser() user: AuthUser) {
    return this.settings.update(dto, { id: user.id, username: user.username });
  }
}
