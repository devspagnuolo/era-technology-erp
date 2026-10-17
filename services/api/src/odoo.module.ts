import { Module } from "@nestjs/common";
import { DatabaseModule } from "./database.module";
import { OdooClient, readOdooConfig } from "./odoo";
import { OdooProducts, OdooProductsController } from "./odoo-products";
@Module({
  imports: [DatabaseModule],
  controllers: [OdooProductsController],
  providers: [
    { provide: OdooClient, useFactory: () => new OdooClient(readOdooConfig()) },
    OdooProducts,
  ],
})
export class OdooModule {}
