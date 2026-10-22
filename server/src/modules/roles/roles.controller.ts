import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { PERMISSIONS } from '../../common/permissions';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../users/user.types';
import { CreateRoleDto, UpdateRoleDto } from './roles.dto';
import { RolesService } from './roles.service';

@Controller('roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.ROLES_VIEW)
  list() {
    return this.roles.list();
  }

  @Get('permissions')
  @RequirePermissions(PERMISSIONS.ROLES_VIEW)
  permissions() {
    return this.roles.permissionCatalog();
  }

  @Post()
  @RequirePermissions(PERMISSIONS.ROLES_MANAGE)
  create(@Body() dto: CreateRoleDto, @CurrentUser() user: AuthUser) {
    return this.roles.create(dto, { id: user.id, username: user.username });
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.ROLES_MANAGE)
  update(
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 404 })) id: string,
    @Body() dto: UpdateRoleDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.roles.update(id, dto, { id: user.id, username: user.username });
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.ROLES_MANAGE)
  remove(
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 404 })) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.roles.remove(id, { id: user.id, username: user.username });
  }
}
