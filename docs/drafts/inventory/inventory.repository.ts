import { Injectable, Inject } from '@nestjs/common';
import { Database } from '../../database';
import { Prisma } from '@prisma/client';

@Injectable()
export class InventoryRepository {
  constructor(@Inject(Database) private db: Database) {}

  // Warehouse CRUD (basic examples)
  listWarehouses(tenantId: string) {
    return this.db.warehouse.findMany({ where: { tenantId } });
  }

  createWarehouse(tenantId: string, data: Prisma.WarehouseCreateInput) {
    return this.db.warehouse.create({ data: { ...data, tenantId } });
  }

  updateWarehouse(id: string, tenantId: string, data: Prisma.WarehouseUpdateInput) {
    return this.db.warehouse.update({
      where: { tenantId_id: { tenantId, id } },
      data,
    });
  }

  deleteWarehouse(id: string, tenantId: string) {
    return this.db.warehouse.delete({
      where: { tenantId_id: { tenantId, id } },
    });
  }
}
