import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { PERMISSIONS } from '../../common/permissions';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import type { AuthUser } from '../users/user.types';
import {
  CreateStorageLocationDto,
  ListStorageFilesQueryDto,
  StorageConfigDto,
  UpdateStorageLocationDto,
} from './storage.dto';
import { StorageService } from './storage.service';

const uuidPipe = new ParseUUIDPipe({ errorHttpStatusCode: 404 });

@Controller('storage')
export class StorageController {
  constructor(private readonly storage: StorageService) {}

  @Get('locations')
  @RequirePermissions(PERMISSIONS.FILES_VIEW)
  listLocations(@Query('includeInactive') includeInactive?: string) {
    return this.storage.listLocations(includeInactive === 'true');
  }

  @Post('locations')
  @RequirePermissions(PERMISSIONS.FILES_MANAGE)
  createLocation(@Body() dto: CreateStorageLocationDto, @CurrentUser() user: AuthUser) {
    return this.storage.createLocation(dto, { id: user.id, username: user.username });
  }

  @Patch('locations/:id')
  @RequirePermissions(PERMISSIONS.FILES_MANAGE)
  updateLocation(
    @Param('id', uuidPipe) id: string,
    @Body() dto: UpdateStorageLocationDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.storage.updateLocation(id, dto, { id: user.id, username: user.username });
  }

  @Delete('locations/:id')
  @RequirePermissions(PERMISSIONS.FILES_MANAGE)
  removeLocation(@Param('id', uuidPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.storage.deleteLocation(id, { id: user.id, username: user.username });
  }

  @Post('locations/:id/check')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.FILES_VIEW)
  checkLocation(@Param('id', uuidPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.storage.getLocation(id, { id: user.id, username: user.username });
  }

  @Post('locations/:id/open-ticket')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.FILES_VIEW)
  openLocationTicket(@Param('id', uuidPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.storage.createLocationOpenTicket(id, {
      id: user.id,
      username: user.username,
    });
  }

  @Get('config')
  @RequirePermissions(PERMISSIONS.FILES_VIEW)
  getConfig() {
    return this.storage.getConfig();
  }

  @Patch('config')
  @RequirePermissions(PERMISSIONS.FILES_MANAGE)
  updateConfig(@Body() dto: StorageConfigDto, @CurrentUser() user: AuthUser) {
    return this.storage.updateConfig(dto, { id: user.id, username: user.username });
  }

  @Get('files')
  @RequirePermissions(PERMISSIONS.FILES_VIEW)
  searchFiles(@Query() query: ListStorageFilesQueryDto) {
    return this.storage.searchFiles(query);
  }

  /** برنامه کمکی ویندوز بلیت را بدون نشست کاربر مصرف می‌کند؛ خود بلیت یک‌بارمصرف است. */
  @Public()
  @Post('open-tickets/:token/consume')
  @HttpCode(HttpStatus.OK)
  consumeTicket(@Param('token') token: string) {
    return this.storage.consumeOpenTicket(token);
  }
}
