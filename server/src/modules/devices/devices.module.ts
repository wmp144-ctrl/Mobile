import { Module } from '@nestjs/common';
import { CustomersModule } from '../customers/customers.module';
import { DeviceConfigController } from './device-config.controller';
import { DeviceConfigService } from './device-config.service';
import { DevicesController } from './devices.controller';
import { DevicesRepository } from './devices.repository';
import { DevicesService } from './devices.service';

@Module({
  imports: [CustomersModule],
  controllers: [DevicesController, DeviceConfigController],
  providers: [DevicesRepository, DevicesService, DeviceConfigService],
  exports: [DevicesRepository, DevicesService, DeviceConfigService],
})
export class DevicesModule {}
