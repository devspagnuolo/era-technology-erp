import {
  Body,
  Controller,
  Get,
  Inject,
  Injectable,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UnprocessableEntityException,
} from "@nestjs/common";
import { z } from "zod";
import { AuthRequest, Permission, parse } from "./auth";
import { Domain } from "./odoo";
import { OdooScope } from "./odoo-scope";
import { OdooForms } from "./odoo-form";
import { OdooRecords, forAudit, recordId } from "./odoo-records";

// Recebimentos, entregas e transferências internas (stock.picking) com o
// formulário completo do Odoo. O Odoo reserva o estoque e move os saldos; a
// ERA dispara as etapas: marcar como a fazer, verificar disponibilidade,
// validar e cancelar.
const MODEL = "stock.picking";
const KINDS = ["incoming", "outgoing", "internal"] as const;
type Kind = (typeof KINDS)[number];
export const TRANSFER_STAGES = {
  draft: ["draft"],
  waiting: ["waiting", "confirmed"],
  ready: ["assigned"],
  done: ["done"],
  cancelled: ["cancel"],
} as const;
export type TransferStage = keyof typeof TRANSFER_STAGES;
const searchInput = z.object({
  kind: z.enum(KINDS).default("incoming"),
  q: z.string().trim().max(100).default(""),
  stage: z
    .enum(["all", "open", "draft", "waiting", "ready", "done", "cancelled"])
    .default("open"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
const kindInput = z.object({ kind: z.enum(KINDS).default("incoming") });

type Many2one = [number, string] | false;
type OdooPicking = {
  id: number;
  name: string;
  partner_id: Many2one;
  picking_type_id: Many2one;
  picking_type_code: Kind;
  state: string;
  scheduled_date: string;
  date_done: string | false;
  origin: string | false;
};
const FIELDS = [
  "name",
  "partner_id",
  "picking_type_id",
  "picking_type_code",
  "state",
  "scheduled_date",
  "date_done",
  "origin",
];
const ref = (value: Many2one) =>
  value ? { id: value[0], name: value[1] } : null;

export function transferStage(state: string): TransferStage {
  for (const [stage, states] of Object.entries(TRANSFER_STAGES))
    if ((states as readonly string[]).includes(state))
      return stage as TransferStage;
  return "draft";
}
export function toEraTransfer(picking: OdooPicking) {
  return {
    id: picking.id,
    number: picking.name,
    partner: ref(picking.partner_id),
    operation: ref(picking.picking_type_id),
    kind: picking.picking_type_code,
    stage: transferStage(picking.state),
    state: picking.state,
    scheduled: picking.scheduled_date,
    done: picking.date_done || null,
    origin: picking.origin || null,
  };
}

// Ações do Odoo por etapa ERA; "validate" pode abrir assistentes no Odoo
// (ex.: lotes/números de série), que a ERA não reproduz.
const ACTIONS = {
  confirm: { from: ["draft"], method: "action_confirm" },
  assign: {
    from: ["waiting", "confirmed", "assigned"],
    method: "action_assign",
  },
  validate: {
    from: ["waiting", "confirmed", "assigned"],
    method: "button_validate",
  },
  cancel: {
    from: ["draft", "waiting", "confirmed", "assigned"],
    method: "action_cancel",
  },
} as const;
type Action = keyof typeof ACTIONS;
const actionInput = z.enum(["confirm", "assign", "validate", "cancel"]);

@Injectable()
export class OdooTransfers {
  readonly records: OdooRecords;
  constructor(
    @Inject(OdooScope) private scope: OdooScope,
    @Inject(OdooForms) forms: OdooForms,
  ) {
    this.records = new OdooRecords(scope, forms, {
      model: MODEL,
      module: "odoo.inventory",
      notFound: "Transferência não encontrada",
      form: { hidden: ["company_id"] },
    });
  }

  async list(req: AuthRequest, raw: unknown) {
    const { kind, q, stage, page, pageSize } = parse(searchInput, raw);
    const companyId = await this.scope.company(req);
    const domain: Domain = [
      ["company_id", "=", companyId],
      ["picking_type_code", "=", kind],
    ];
    if (stage === "open") domain.push(["state", "not in", ["done", "cancel"]]);
    else if (stage !== "all")
      domain.push(["state", "in", [...TRANSFER_STAGES[stage]]]);
    if (q)
      domain.push(
        "|",
        "|",
        ["name", "ilike", q],
        ["partner_id.name", "ilike", q],
        ["origin", "ilike", q],
      );
    const odoo = this.scope.odoo;
    const [items, total] = await Promise.all([
      odoo.execute<OdooPicking[]>(companyId, MODEL, "search_read", [domain], {
        fields: FIELDS,
        offset: (page - 1) * pageSize,
        limit: pageSize,
        order: "scheduled_date desc, id desc",
      }),
      odoo.execute<number>(companyId, MODEL, "search_count", [domain]),
    ]);
    return { items: items.map(toEraTransfer), total, page, pageSize };
  }

  // Novo registro já vem com o tipo de operação da empresa (recebimento,
  // entrega ou interna), como no menu correspondente do Odoo.
  async form(req: AuthRequest, id?: number, raw?: unknown) {
    if (id) {
      const form = await this.records.form(req, id);
      return { ...form, summary: await this.summary(req, id) };
    }
    const { kind } = parse(kindInput, raw ?? {});
    const companyId = await this.scope.company(req);
    const [type] = await this.scope.odoo.execute<Array<{ id: number }>>(
      companyId,
      "stock.picking.type",
      "search_read",
      [
        [
          ["code", "=", kind],
          ["company_id", "=", companyId],
        ],
      ],
      { fields: ["id"], limit: 1, order: "sequence, id" },
    );
    if (!type)
      throw new UnprocessableEntityException(
        "A empresa não tem este tipo de operação no Odoo",
      );
    const form = await this.records.form(req, undefined, {
      default_picking_type_id: type.id,
    });
    return { ...form, summary: null };
  }

  async summary(req: AuthRequest, id: number) {
    const companyId = await this.scope.company(req);
    const [picking] = await this.scope.odoo.execute<OdooPicking[]>(
      companyId,
      MODEL,
      "search_read",
      [
        [
          ["id", "=", id],
          ["company_id", "=", companyId],
        ],
      ],
      { fields: FIELDS },
    );
    if (!picking)
      throw new UnprocessableEntityException("Transferência não encontrada");
    return toEraTransfer(picking);
  }

  async run(req: AuthRequest, id: number, action: Action) {
    const companyId = await this.scope.company(req);
    const before = await this.summary(req, id);
    const { from, method } = ACTIONS[action];
    if (!(from as readonly string[]).includes(before.state))
      throw new UnprocessableEntityException(
        "Esta ação não está disponível para a transferência atual",
      );
    // Sem assistente de pendência: o que faltar vira um novo pedido pendente
    // (padrão do Odoo). Outros assistentes precisam ser concluídos no Odoo.
    const result = await this.scope.odoo.execute<unknown>(
      companyId,
      MODEL,
      method,
      [[id]],
      { context: { skip_backorder: true, skip_sms: true } },
    );
    if (result && typeof result === "object" && "res_model" in result)
      throw new UnprocessableEntityException(
        "O Odoo pediu mais informações para concluir (ex.: lotes ou números de série). Conclua esta etapa no Odoo.",
      );
    const after = await this.summary(req, id);
    await this.scope.audit(
      req,
      "odoo.inventory",
      MODEL,
      action,
      id,
      forAudit(before),
      forAudit(after),
    );
    return after;
  }
}

@Controller("odoo/transfers")
export class OdooTransfersController {
  constructor(@Inject(OdooTransfers) private transfers: OdooTransfers) {}
  @Get() @Permission("inventory:read") list(
    @Req() req: AuthRequest,
    @Query() query: unknown,
  ) {
    return this.transfers.list(req, query);
  }
  @Get("form") @Permission("inventory:create") newForm(
    @Req() req: AuthRequest,
    @Query() query: unknown,
  ) {
    return this.transfers.form(req, undefined, query);
  }
  @Get(":id/form") @Permission("inventory:read") form(
    @Req() req: AuthRequest,
    @Param("id", ParseIntPipe) id: number,
  ) {
    return this.transfers.form(req, id);
  }
  @Post("onchange") @Permission("inventory:read") onchange(
    @Req() req: AuthRequest,
    @Body() body: unknown,
    @Query("id") id?: string,
  ) {
    return this.transfers.records.onchange(req, body, recordId(id));
  }
  @Post("lookup") @Permission("inventory:read") lookup(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    return this.transfers.records.lookup(req, body);
  }
  @Post() @Permission("inventory:create") create(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    return this.transfers.records.create(req, body);
  }
  @Patch(":id") @Permission("inventory:update") update(
    @Req() req: AuthRequest,
    @Param("id", ParseIntPipe) id: number,
    @Body() body: unknown,
  ) {
    return this.transfers.records.update(req, id, body);
  }
  @Post(":id/:action") @Permission("inventory:validate") run(
    @Req() req: AuthRequest,
    @Param("id", ParseIntPipe) id: number,
    @Param("action") action: string,
  ) {
    return this.transfers.run(req, id, parse(actionInput, action));
  }
}
