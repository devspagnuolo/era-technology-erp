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
import {
  OdooEquipment,
  OdooEquipmentController,
  OdooMaintenance,
  OdooMaintenanceController,
} from "./odoo-maintenance";
import { OdooTimeOff, OdooTimeOffController } from "./odoo-time-off";
import {
  OdooExpenseReports,
  OdooExpenseReportsController,
  OdooExpenses,
  OdooExpensesController,
} from "./odoo-expenses";
import { OdooRuntime, OdooRuntimeController } from "./odoo-runtime";
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
    OdooMaintenanceController,
    OdooEquipmentController,
    OdooTimeOffController,
    OdooExpensesController,
    OdooExpenseReportsController,
    OdooRuntimeController,
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
    OdooMaintenance,
    OdooEquipment,
    OdooTimeOff,
    OdooExpenses,
    OdooExpenseReports,
    OdooRuntime,
  ],
  exports: [OdooClient],
})
export class OdooModule {}
