import { Module } from "@nestjs/common";
import { DatabaseModule } from "./database.module";
import { OdooClient, readOdooConfig } from "./odoo";
import { OdooScope } from "./odoo-scope";
import { OdooForms } from "./odoo-form";
import { OdooStatusController } from "./odoo-status";
import { OdooProducts, OdooProductsController } from "./odoo-products";
import { OdooContacts, OdooContactsController } from "./odoo-contacts";
import { OdooSales, OdooSalesController } from "./odoo-sales";
import { OdooPurchases, OdooPurchasesController } from "./odoo-purchases";
@Module({
  imports: [DatabaseModule],
  controllers: [
    OdooStatusController,
    OdooProductsController,
    OdooContactsController,
    OdooSalesController,
    OdooPurchasesController,
  ],
  providers: [
    { provide: OdooClient, useFactory: () => new OdooClient(readOdooConfig()) },
    OdooScope,
    OdooForms,
    OdooProducts,
    OdooContacts,
    OdooSales,
    OdooPurchases,
  ],
})
export class OdooModule {}
