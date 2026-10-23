import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { PERMISSIONS } from '../../common/permissions';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../users/user.types';
import {
  CreateFieldDto,
  CreateOptionDto,
  UpdateFieldDto,
  UpdateOptionDto,
} from './device-config.dto';
import { DeviceConfigService } from './device-config.service';

const uuidPipe = new ParseUUIDPipe({ errorHttpStatusCode: 404 });

@Controller('device-config')
export class DeviceConfigController {
  constructor(private readonly config: DeviceConfigService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.REPAIRS_VIEW)
  getConfig() {
    return this.config.getConfig();
  }

  @Get('fields')
  @RequirePermissions(PERMISSIONS.REPAIRS_VIEW)
  listFields() {
    return this.config.listFields();
  }

  @Get('statuses')
  @RequirePermissions(PERMISSIONS.REPAIRS_VIEW)
  listStatuses() {
    return this.config.listStatuses(false);
  }

  @Post('fields')
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  createField(@Body() dto: CreateFieldDto, @CurrentUser() user: AuthUser) {
    return this.config.createField(dto, { id: user.id, username: user.username });
  }

  @Patch('fields/:id')
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  updateField(
    @Param('id', uuidPipe) id: string,
    @Body() dto: UpdateFieldDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.config.updateField(id, dto, { id: user.id, username: user.username });
  }

  @Delete('fields/:id')
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  deleteField(@Param('id', uuidPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.config.deleteField(id, { id: user.id, username: user.username });
  }

  @Get('options')
  @RequirePermissions(PERMISSIONS.REPAIRS_VIEW)
  listOptions() {
    return this.config.listOptions();
  }

  @Post('options')
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  createOption(@Body() dto: CreateOptionDto, @CurrentUser() user: AuthUser) {
    return this.config.createOption(dto, { id: user.id, username: user.username });
  }

  @Patch('options/:id')
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  updateOption(
    @Param('id', uuidPipe) id: string,
    @Body() dto: UpdateOptionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.config.updateOption(id, dto, { id: user.id, username: user.username });
  }

  @Delete('options/:id')
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  deleteOption(@Param('id', uuidPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.config.deleteOption(id, { id: user.id, username: user.username });
  }

  @Get('technicians')
  @RequirePermissions(PERMISSIONS.REPAIRS_VIEW)
  listTechnicians() {
    return this.config.listTechnicians();
  }
}
