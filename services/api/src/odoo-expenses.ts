import {
  Inject,
  Injectable,
  UnprocessableEntityException,
} from "@nestjs/common";
import { OdooScope } from "./odoo-scope";
import { OdooForms } from "./odoo-form";
import {
  AppConfig,
  OdooApp,
  appController,
  call,
  finished,
  ref,
  text,
} from "./odoo-app";

// Despesas (hr.expense) e relatórios de despesas (hr.expense.sheet) com os
// formulários do Odoo. A despesa é lançada e enviada em um relatório; o
// relatório é aprovado, contabilizado e pago no Odoo, disparado pela ERA.
const money = (value: unknown) => Number(value ?? 0).toFixed(2);

export const EXPENSES: AppConfig = {
  model: "hr.expense",
  module: "odoo.expenses",
  notFound: "Despesa não encontrada",
  form: { hidden: ["company_id"] },
  fields: [
    "name",
    "employee_id",
    "product_id",
    "date",
    "total_amount_currency",
    "currency_id",
    "payment_mode",
    "state",
    "sheet_id",
  ],
  search: ["name", "employee_id.name", "product_id.name"],
  order: "date desc, id desc",
  filters: {
    draft: [["state", "=", "draft"]],
    open: [["state", "in", ["reported", "submitted", "approved"]]],
    done: [["state", "=", "done"]],
    refused: [["state", "=", "refused"]],
    all: [],
  },
  defaultFilter: "all",
  toEra: (row) => ({
    id: row.id,
    name: row.name,
    employee: ref(row.employee_id),
    category: ref(row.product_id),
    date: text(row.date),
    total: money(row.total_amount_currency),
    currency: ref(row.currency_id)?.name ?? null,
    paidBy: row.payment_mode,
    state: row.state,
    report: ref(row.sheet_id),
  }),
  actions: {
    // Cria o relatório de despesas no Odoo (o Odoo responde abrindo o
    // relatório, que a ERA mostra na aba de relatórios).
    submit: {
      allowed: (s) => s.state === "draft",
      run: async ({ odoo, companyId, model, id }) => {
        await odoo.execute(companyId, model, "action_submit_expenses", [[id]]);
      },
    },
  },
};

export const SHEET_STAGES = {
  draft: ["draft"],
  submitted: ["submit"],
  approved: ["approve"],
  posted: ["post"],
  done: ["done"],
  refused: ["cancel"],
} as const;

const DUPLICATE = "hr.expense.approve.duplicate";

export const EXPENSE_REPORTS: AppConfig = {
  model: "hr.expense.sheet",
  module: "odoo.expense-reports",
  notFound: "Relatório de despesas não encontrado",
  form: { hidden: ["company_id"] },
  fields: [
    "name",
    "employee_id",
    "total_amount",
    "amount_residual",
    "currency_id",
    "payment_mode",
    "state",
    "payment_state",
    "accounting_date",
    "create_date",
  ],
  search: ["name", "employee_id.name"],
  order: "create_date desc, id desc",
  filters: {
    open: [["state", "in", ["draft", "submit", "approve", "post"]]],
    draft: [["state", "=", "draft"]],
    submitted: [["state", "=", "submit"]],
    approved: [["state", "=", "approve"]],
    posted: [["state", "=", "post"]],
    done: [["state", "=", "done"]],
    refused: [["state", "=", "cancel"]],
    all: [],
  },
  defaultFilter: "open",
  toEra: (row) => ({
    id: row.id,
    name: row.name,
    employee: ref(row.employee_id),
    total: money(row.total_amount),
    residual: money(row.amount_residual),
    currency: ref(row.currency_id)?.name ?? null,
    paidBy: row.payment_mode,
    state: row.state,
    payment: row.payment_state,
    date: text(row.accounting_date) ?? text(row.create_date),
  }),
  actions: {
    submit: {
      allowed: (s) => s.state === "draft",
      run: call("action_submit_sheet"),
    },
    // Com despesas parecidas (mesmo funcionário, valor e data), o Odoo pede
    // para confirmar a possível duplicidade antes de aprovar.
    approve: {
      allowed: (s) => s.state === "submit",
      run: async ({ odoo, companyId, model, id }) => {
        const result = await odoo.execute(
          companyId,
          model,
          "action_approve_expense_sheets",
          [[id]],
        );
        if ((result as { res_model?: string })?.res_model === DUPLICATE)
          throw new UnprocessableEntityException(
            "O Odoo encontrou despesas parecidas neste relatório (possível duplicidade); revise e aprove no Odoo",
          );
        finished(result);
      },
    },
    post: {
      allowed: (s) => s.state === "approve",
      run: call("action_sheet_move_post"),
    },
    // Reembolso ao funcionário: pagamento integral no diário padrão do Odoo.
    pay: {
      allowed: (s) => s.state === "post",
      run: async ({ odoo, companyId, model, id }) => {
        const [sheet] = await odoo.execute<
          Array<{ account_move_ids: number[] }>
        >(companyId, model, "read", [[id], ["account_move_ids"]]);
        const context = {
          active_model: "account.move",
          active_ids: sheet.account_move_ids,
        };
        const [wizard] = await odoo.execute<number[]>(
          companyId,
          "account.payment.register",
          "create",
          [[{}]],
          { context },
        );
        await odoo.execute(
          companyId,
          "account.payment.register",
          "action_create_payments",
          [[wizard]],
          { context },
        );
      },
    },
    reset: {
      allowed: (s) => ["submit", "approve", "cancel"].includes(String(s.state)),
      run: call("action_reset_expense_sheets"),
    },
  },
};

@Injectable()
export class OdooExpenses extends OdooApp {
  constructor(
    @Inject(OdooScope) scope: OdooScope,
    @Inject(OdooForms) forms: OdooForms,
  ) {
    super(scope, forms, EXPENSES);
  }
}
@Injectable()
export class OdooExpenseReports extends OdooApp {
  constructor(
    @Inject(OdooScope) scope: OdooScope,
    @Inject(OdooForms) forms: OdooForms,
  ) {
    super(scope, forms, EXPENSE_REPORTS);
  }
}
export const OdooExpensesController = appController(
  "odoo/expenses",
  "expenses",
  OdooExpenses,
);
export const OdooExpenseReportsController = appController(
  "odoo/expense-reports",
  "expenses",
  OdooExpenseReports,
  "expenses:approve",
);
