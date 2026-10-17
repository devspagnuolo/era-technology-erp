import { Inject, Injectable } from "@nestjs/common";
import { OdooScope } from "./odoo-scope";
import { OdooForms } from "./odoo-form";
import { OdooOrders, OrderConfig, ordersController } from "./odoo-orders";

// Solicitações de cotação e pedidos de compra vivem no Odoo (purchase.order),
// com o formulário completo da tela de compra do Odoo. Pedidos que dependem
// de aprovação ficam em "Aguardando aprovação" até alguém aprovar no Odoo.
export const PURCHASES: OrderConfig = {
  model: "purchase.order",
  module: "odoo.purchases",
  notFound: "Pedido de compra não encontrado",
  form: { hidden: ["company_id"] },
  stages: {
    quotation: ["draft", "sent", "to approve"],
    order: ["purchase", "done"],
    cancelled: ["cancel"],
  },
  confirmFrom: ["draft", "sent"],
  reference: "partner_ref",
  methods: {
    confirm: "button_confirm",
    cancel: "button_cancel",
    reopen: "button_draft",
  },
};

@Injectable()
export class OdooPurchases {
  readonly orders: OdooOrders;
  constructor(
    @Inject(OdooScope) scope: OdooScope,
    @Inject(OdooForms) forms: OdooForms,
  ) {
    this.orders = new OdooOrders(scope, forms, PURCHASES);
  }
}

export const OdooPurchasesController = ordersController(
  "odoo/purchases",
  "purchases",
  OdooPurchases,
);
