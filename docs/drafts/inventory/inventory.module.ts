import { Module } from '@nestjs/common';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { InventoryRepository } from './inventory.repository';
import { Database } from '../../database';

@Module({
  controllers: [InventoryController],
  providers: [InventoryService, InventoryRepository, Database],
})
export class InventoryModule {}
