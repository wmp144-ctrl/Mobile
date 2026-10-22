import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { RolesController } from './roles.controller';
import { RolesRepository } from './roles.repository';
import { RolesService } from './roles.service';

@Module({
  imports: [UsersModule],
  controllers: [RolesController],
  providers: [RolesRepository, RolesService],
  exports: [RolesRepository, RolesService],
})
export class RolesModule {}
