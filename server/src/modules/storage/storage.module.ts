import { Module } from '@nestjs/common';
import { StorageController } from './storage.controller';
import { StorageRepository } from './storage.repository';
import { StorageService } from './storage.service';

@Module({
  controllers: [StorageController],
  providers: [StorageRepository, StorageService],
  exports: [StorageRepository, StorageService],
})
export class StorageModule {}
