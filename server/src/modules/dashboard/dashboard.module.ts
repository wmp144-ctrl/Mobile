import { Module } from '@nestjs/common';
import { DevicesModule } from '../devices/devices.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [DevicesModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
