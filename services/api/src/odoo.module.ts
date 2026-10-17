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
import { OdooTransfers, OdooTransfersController } from "./odoo-transfers";
import { OdooInvoices, OdooInvoicesController } from "./odoo-invoices";
import { OdooCrm, OdooCrmController } from "./odoo-crm";
import {
  OdooManufacturing,
  OdooManufacturingController,
} from "./odoo-manufacturing";
import {
  OdooProjects,
  OdooProjectsController,
  OdooTasks,
  OdooTasksController,
} from "./odoo-projects";
import { OdooEmployees, OdooEmployeesController } from "./odoo-employees";
@Module({
  imports: [DatabaseModule],
  controllers: [
    OdooStatusController,
    OdooProductsController,
    OdooContactsController,
    OdooSalesController,
    OdooPurchasesController,
    OdooTransfersController,
    OdooInvoicesController,
    OdooCrmController,
    OdooManufacturingController,
    OdooProjectsController,
    OdooTasksController,
    OdooEmployeesController,
  ],
  providers: [
    { provide: OdooClient, useFactory: () => new OdooClient(readOdooConfig()) },
    OdooScope,
    OdooForms,
    OdooProducts,
    OdooContacts,
    OdooSales,
    OdooPurchases,
    OdooTransfers,
    OdooInvoices,
    OdooCrm,
    OdooManufacturing,
    OdooProjects,
    OdooTasks,
    OdooEmployees,
  ],
})
export class OdooModule {}
