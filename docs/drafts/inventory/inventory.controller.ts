import { Controller, Get, Param, Post, Body, Patch, Delete } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { parse } from '../../auth';
import { z } from 'zod';

const createWarehouseInput = z.object({
  name: z.string().min(2).max(120),
  address: z.string().optional(),
});

@Controller('warehouses')
export class InventoryController {
  constructor(private readonly service: InventoryService) {}

  @Get()
  list() {
    return this.service.listWarehouses();
  }

  @Post()
  create(@Body() body: unknown) {
    const data = parse(createWarehouseInput, body);
    return this.service.createWarehouse(data);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: unknown) {
    // For brevity, reuse the same schema (partial)
    const data = parse(createWarehouseInput.partial(), body);
    return this.service.updateWarehouse(id, data);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.removeWarehouse(id);
  }
}
