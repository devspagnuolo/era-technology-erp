import { Module } from "@nestjs/common";
import { DatabaseModule } from "./database.module";
import { OdooClient, readOdooConfig } from "./odoo";
import { OdooScope } from "./odoo-scope";
import { OdooStatusController } from "./odoo-status";
import { OdooProducts, OdooProductsController } from "./odoo-products";
import { OdooContacts, OdooContactsController } from "./odoo-contacts";
@Module({
  imports: [DatabaseModule],
  controllers: [
    OdooStatusController,
    OdooProductsController,
    OdooContactsController,
  ],
  providers: [
    { provide: OdooClient, useFactory: () => new OdooClient(readOdooConfig()) },
    OdooScope,
    OdooProducts,
    OdooContacts,
  ],
})
export class OdooModule {}
