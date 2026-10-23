import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { OriginGuard } from './common/guards/origin.guard';
import { AuditModule } from './modules/audit/audit.module';
import { SettingsModule } from './modules/settings/settings.module';
import { UsersModule } from './modules/users/users.module';
import { RolesModule } from './modules/roles/roles.module';
import { AuthModule } from './modules/auth/auth.module';
import { BackupsModule } from './modules/backups/backups.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { SystemModule } from './modules/system/system.module';
import { CustomersModule } from './modules/customers/customers.module';
import { DevicesModule } from './modules/devices/devices.module';
import { StorageModule } from './modules/storage/storage.module';

@Module({
  imports: [
    ConfigModule,
    ScheduleModule.forRoot(),
    DatabaseModule,
    AuditModule,
    SettingsModule,
    UsersModule,
    RolesModule,
    AuthModule,
    BackupsModule,
    DashboardModule,
    SystemModule,
    CustomersModule,
    StorageModule,
    DevicesModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: OriginGuard }],
})
export class AppModule {}
