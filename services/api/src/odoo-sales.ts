import { Inject, Injectable } from "@nestjs/common";
import { OdooScope } from "./odoo-scope";
import { OdooForms } from "./odoo-form";
import { OdooOrders, OrderConfig, ordersController } from "./odoo-orders";

// Orçamentos e pedidos de venda vivem no Odoo (sale.order); a ERA oferece a
// tela. O formulário completo (cabeçalho, itens e demais abas) vem da própria
// tela de pedido do Odoo; preços, impostos e totais são calculados por ele.
export const SALES: OrderConfig = {
  model: "sale.order",
  module: "odoo.sales",
  notFound: "Pedido não encontrado",
  // O Odoo escolhe a variante pelo modelo do produto no navegador; na ERA o
  // item usa diretamente o produto (variante).
  form: {
    hidden: ["company_id", "product_template_id"],
    labels: { product_id: "Produto" },
  },
  stages: {
    quotation: ["draft", "sent"],
    order: ["sale"],
    cancelled: ["cancel"],
  },
  confirmFrom: ["draft", "sent"],
  reference: "client_order_ref",
  methods: {
    confirm: "action_confirm",
    cancel: "action_cancel",
    reopen: "action_draft",
  },
};

@Injectable()
export class OdooSales {
  readonly orders: OdooOrders;
  constructor(
    @Inject(OdooScope) scope: OdooScope,
    @Inject(OdooForms) forms: OdooForms,
  ) {
    this.orders = new OdooOrders(scope, forms, SALES);
  }
}

export const OdooSalesController = ordersController(
  "odoo/sales",
  "sales",
  OdooSales,
);
