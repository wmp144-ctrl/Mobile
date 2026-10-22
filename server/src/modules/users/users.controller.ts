import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { PERMISSIONS } from '../../common/permissions';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateUserDto, ListUsersQueryDto, ResetPasswordDto, UpdateUserDto } from './users.dto';
import { UsersService } from './users.service';
import type { AuthUser } from './user.types';

const uuidPipe = new ParseUUIDPipe({ errorHttpStatusCode: 404 });

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.USERS_VIEW)
  list(@Query() query: ListUsersQueryDto) {
    return this.usersService.list(query);
  }

  @Get('role-options')
  @RequirePermissions(PERMISSIONS.USERS_VIEW)
  roleOptions() {
    return this.usersService.roleOptions();
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.USERS_VIEW)
  get(@Param('id', uuidPipe) id: string) {
    return this.usersService.getById(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  create(@Body() dto: CreateUserDto, @CurrentUser() user: AuthUser) {
    return this.usersService.create(dto, { id: user.id, username: user.username });
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  update(
    @Param('id', uuidPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.usersService.update(id, dto, { id: user.id, username: user.username });
  }

  @Post(':id/reset-password')
  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  resetPassword(
    @Param('id', uuidPipe) id: string,
    @Body() dto: ResetPasswordDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.usersService.resetPassword(id, dto.newPassword, { id: user.id, username: user.username });
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  remove(@Param('id', uuidPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.usersService.remove(id, { id: user.id, username: user.username });
  }
}
