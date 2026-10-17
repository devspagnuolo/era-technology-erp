import { BadRequestException, NotFoundException } from "@nestjs/common";
import { AuthRequest } from "./auth";
import { Domain } from "./odoo";
import { FormOptions, FormSchema, OdooForms } from "./odoo-form";
import { OdooScope, auditAction } from "./odoo-scope";

type Values = Record<string, unknown>;
export type SaveBody = { values?: unknown; extra?: Values };
export type RecordConfig = {
  model: string;
  module: string; // nome do módulo na auditoria ERA
  notFound: string;
  form?: FormOptions;
  // Restrições fixas de leitura (além da empresa), ex.: só contatos principais.
  domain?: Domain;
  // Regras do módulo antes de gravar (unicidade, papéis etc.).
  prepare?: (ctx: {
    companyId: number;
    values: Values;
    extra: Values;
    current: Values | null;
  }) => Promise<void> | void;
};

// Registro completo de um modelo do Odoo, sempre preso à empresa do tenant:
// formulário (campos da tela do Odoo), leitura, gravação e recálculo.
export class OdooRecords {
  constructor(
    private scope: OdooScope,
    private forms: OdooForms,
    private config: RecordConfig,
  ) {}

  schema(companyId: number) {
    return this.forms.schema(companyId, this.config.model, this.config.form);
  }

  private domain(companyId: number, id: number): Domain {
    return [
      ["id", "=", id],
      ["company_id", "=", companyId],
      ...(this.config.domain ?? []),
    ];
  }

  async find(companyId: number, schema: FormSchema, id: number) {
    const record = await this.forms.read(
      companyId,
      schema,
      this.domain(companyId, id),
    );
    if (!record) throw new NotFoundException(this.config.notFound);
    return record;
  }

  // Formulário para novo registro (valores padrão do Odoo) ou existente.
  // "context" leva padrões do Odoo (ex.: default_picking_type_id).
  async form(req: AuthRequest, id?: number, context: Values = {}) {
    const companyId = await this.scope.company(req);
    const schema = await this.schema(companyId);
    const values = id
      ? await this.find(companyId, schema, id)
      : await this.forms.defaults(companyId, schema, context);
    return { schema, values };
  }

  async onchange(req: AuthRequest, body: unknown, id?: number) {
    const companyId = await this.scope.company(req);
    const schema = await this.schema(companyId);
    if (id) await this.find(companyId, schema, id);
    return this.forms.onchange(companyId, schema, body, id);
  }

  async lookup(req: AuthRequest, body: unknown) {
    const companyId = await this.scope.company(req);
    return this.forms.lookup(companyId, await this.schema(companyId), body);
  }

  async create(req: AuthRequest, raw: unknown) {
    const body = (raw ?? {}) as SaveBody;
    const companyId = await this.scope.company(req);
    const schema = await this.schema(companyId);
    const values = await this.forms.values(
      companyId,
      schema,
      body.values ?? {},
      {},
    );
    await this.config.prepare?.({
      companyId,
      values,
      extra: body.extra ?? {},
      current: null,
    });
    const [id] = await this.scope.odoo.execute<number[]>(
      companyId,
      this.config.model,
      "create",
      [[{ ...values, company_id: companyId }]],
    );
    const after = await this.find(companyId, schema, id);
    await this.scope.audit(
      req,
      this.config.module,
      this.config.model,
      "create",
      id,
      null,
      forAudit(after),
    );
    return after;
  }

  async update(req: AuthRequest, id: number, raw: unknown) {
    const body = (raw ?? {}) as SaveBody & { active?: unknown };
    const companyId = await this.scope.company(req);
    const schema = await this.schema(companyId);
    const before = await this.find(companyId, schema, id);
    let values: Values = {};
    let action: string = "update";
    if (body.active !== undefined) {
      if (typeof body.active !== "boolean")
        throw new BadRequestException("Situação inválida");
      const current = await this.isActive(companyId, id);
      values.active = body.active;
      action = auditAction(body.active, current);
    } else {
      values = await this.forms.values(
        companyId,
        schema,
        body.values ?? {},
        before,
      );
      await this.config.prepare?.({
        companyId,
        values,
        extra: body.extra ?? {},
        current: before,
      });
    }
    if (Object.keys(values).length)
      await this.scope.odoo.execute(companyId, this.config.model, "write", [
        [id],
        values,
      ]);
    const after = await this.find(companyId, schema, id);
    await this.scope.audit(
      req,
      this.config.module,
      this.config.model,
      action,
      id,
      forAudit(before),
      forAudit(after),
    );
    return after;
  }

  private async isActive(companyId: number, id: number) {
    const [row] = await this.scope.odoo.execute<Array<{ active: boolean }>>(
      companyId,
      this.config.model,
      "search_read",
      [this.domain(companyId, id)],
      { fields: ["active"], context: { active_test: false } },
    );
    if (!row) throw new NotFoundException(this.config.notFound);
    return row.active;
  }
}

// Imagens não vão para a auditoria; apenas a indicação de que existem.
export function forAudit(record: Values) {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [
      key,
      typeof value === "string" && value.length > 2000 ? "[arquivo]" : value,
    ]),
  );
}

export function recordId(raw?: string) {
  if (raw === undefined || raw === "") return undefined;
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1)
    throw new BadRequestException("Registro inválido");
  return id;
}
