import { Module } from '@nestjs/common';
import { RolesRepository } from '../roles/roles.repository';
import { UsersController } from './users.controller';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';

@Module({
  controllers: [UsersController],
  providers: [UsersRepository, UsersService, RolesRepository],
  exports: [UsersRepository, UsersService],
})
export class UsersModule {}
