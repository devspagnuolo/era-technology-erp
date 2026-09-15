import { Module } from '@nestjs/common';
import { PurchasingController } from './purchasing.controller';
import { PurchasingService } from './purchasing.service';
import { PurchasingRepository } from './purchasing.repository';
import { Database } from '../../database';

@Module({
  controllers: [PurchasingController],
  providers: [PurchasingService, PurchasingRepository, Database],
})
export class PurchasingModule {}
