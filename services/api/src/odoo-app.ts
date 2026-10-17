import {
  Body,
  Controller,
  Get,
  Inject,
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
import { Domain, OdooClient } from "./odoo";
import { OdooScope } from "./odoo-scope";
import { OdooForms } from "./odoo-form";
import {
  OdooRecords,
  RecordConfig,
  companyField,
  forAudit,
  recordId,
} from "./odoo-records";

// Módulo do Odoo em configuração: lista com busca e filtros, formulário
// completo (tela do Odoo), resumo para o cabeçalho e ações do próprio Odoo
// (ganhar, concluir, arquivar...). Cada módulo novo (CRM, Fabricação,
// Projeto, Funcionários) só descreve o que muda.
type Values = Record<string, unknown>;
type Row = Values & { id: number };
export type Many2one = [number, string] | false;
export const ref = (value: unknown) =>
  Array.isArray(value)
    ? { id: value[0] as number, name: value[1] as string }
    : null;
export const text = (value: unknown) =>
  typeof value === "string" && value ? value : null;

export type AppAction = {
  allowed: (summary: Values) => boolean;
  run: (ctx: {
    odoo: OdooClient;
    companyId: number;
    model: string;
    id: number;
    body: Values;
    summary: Values; // situação antes da ação
  }) => Promise<unknown>;
};
export type AppConfig = RecordConfig & {
  fields: string[]; // lidos na lista e no resumo
  search: string[]; // campos da busca livre
  order: string;
  filters: Record<string, Domain>; // filtros da lista (?filter=)
  defaultFilter: string;
  // Recorte extra da lista pela consulta (ex.: tarefas de um projeto).
  where?: (query: Record<string, string>) => Domain;
  toEra: (row: Row) => Values;
  // Padrões do Odoo para um novo registro, a partir da consulta.
  newContext?: (query: Record<string, string>) => Values;
  actions?: Record<string, AppAction>;
};

const searchInput = z.object({
  q: z.string().trim().max(100).default(""),
  filter: z.string().trim().max(40).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

// Ação que abre um assistente no Odoo (backorder, consumo, motivo...) não é
// concluída pela ERA: o usuário termina no próprio Odoo.
export function finished(result: unknown) {
  if (result && typeof result === "object" && "res_model" in result)
    throw new UnprocessableEntityException(
      "O Odoo pediu uma confirmação adicional; conclua esta etapa no Odoo",
    );
}
export const call =
  (method: string, context: Values = {}) =>
  async ({ odoo, companyId, model, id }: Parameters<AppAction["run"]>[0]) =>
    finished(await odoo.execute(companyId, model, method, [[id]], { context }));

export class OdooApp {
  readonly records: OdooRecords;
  constructor(
    private scope: OdooScope,
    forms: OdooForms,
    readonly config: AppConfig,
  ) {
    this.records = new OdooRecords(scope, forms, config);
  }

  async list(req: AuthRequest, raw: unknown) {
    const input = parse(searchInput, raw);
    const filter = input.filter ?? this.config.defaultFilter;
    const extra = this.config.filters[filter];
    if (!extra) throw new UnprocessableEntityException("Filtro inválido");
    const companyId = await this.scope.company(req);
    const domain: Domain = [
      [companyField(this.config), "=", companyId],
      ...(this.config.domain ?? []),
      ...extra,
      ...(this.config.where?.((raw ?? {}) as Record<string, string>) ?? []),
    ];
    if (input.q) {
      const terms = this.config.search;
      for (let i = 1; i < terms.length; i++) domain.push("|");
      for (const term of terms) domain.push([term, "ilike", input.q]);
    }
    const { odoo } = this.scope;
    const { model, fields, order } = this.config;
    const [items, total] = await Promise.all([
      odoo.execute<Row[]>(companyId, model, "search_read", [domain], {
        fields,
        offset: (input.page - 1) * input.pageSize,
        limit: input.pageSize,
        order,
      }),
      odoo.execute<number>(companyId, model, "search_count", [domain]),
    ]);
    return {
      items: items.map((row) => this.config.toEra(row)),
      total,
      page: input.page,
      pageSize: input.pageSize,
    };
  }

  async form(req: AuthRequest, id?: number, query: unknown = {}) {
    if (id) {
      const form = await this.records.form(req, id);
      return { ...form, summary: await this.summary(req, id) };
    }
    const context = this.config.newContext?.(
      (query ?? {}) as Record<string, string>,
    );
    return {
      ...(await this.records.form(req, undefined, context)),
      summary: null,
    };
  }

  async summary(req: AuthRequest, id: number) {
    const companyId = await this.scope.company(req);
    const [row] = await this.scope.odoo.execute<Row[]>(
      companyId,
      this.config.model,
      "search_read",
      [
        [
          ["id", "=", id],
          [companyField(this.config), "=", companyId],
          ...(this.config.domain ?? []),
        ],
      ],
      { fields: this.config.fields },
    );
    if (!row) throw new UnprocessableEntityException(this.config.notFound);
    return this.config.toEra(row);
  }

  async run(req: AuthRequest, id: number, name: string, body: unknown) {
    const action = this.config.actions?.[name];
    if (!action) throw new UnprocessableEntityException("Ação inválida");
    const companyId = await this.scope.company(req);
    const before = await this.summary(req, id);
    if (!action.allowed(before))
      throw new UnprocessableEntityException(
        "Esta ação não está disponível para o registro atual",
      );
    await action.run({
      odoo: this.scope.odoo,
      companyId,
      model: this.config.model,
      id,
      body: (body ?? {}) as Values,
      summary: before,
    });
    const after = await this.summary(req, id);
    await this.scope.audit(
      req,
      this.config.module,
      this.config.model,
      name,
      id,
      forAudit(before),
      forAudit(after),
    );
    return after;
  }
}

// Rotas iguais para cada módulo; mudam o caminho e as permissões.
// "act" é a permissão das ações (ex.: crm:update, manufacturing:produce).
export function appController(
  path: string,
  permission: string,
  service: abstract new (...args: never[]) => OdooApp,
  act = permission + ":update",
) {
  @Controller(path)
  class AppController {
    constructor(@Inject(service) private app: OdooApp) {}
    @Get() @Permission(permission + ":read") list(
      @Req() req: AuthRequest,
      @Query() query: unknown,
    ) {
      return this.app.list(req, query);
    }
    @Get("form") @Permission(permission + ":create") newForm(
      @Req() req: AuthRequest,
      @Query() query: unknown,
    ) {
      return this.app.form(req, undefined, query);
    }
    @Get(":id/form") @Permission(permission + ":read") form(
      @Req() req: AuthRequest,
      @Param("id", ParseIntPipe) id: number,
    ) {
      return this.app.form(req, id);
    }
    @Post("onchange") @Permission(permission + ":read") onchange(
      @Req() req: AuthRequest,
      @Body() body: unknown,
      @Query("id") id?: string,
    ) {
      return this.app.records.onchange(req, body, recordId(id));
    }
    @Post("lookup") @Permission(permission + ":read") lookup(
      @Req() req: AuthRequest,
      @Body() body: unknown,
    ) {
      return this.app.records.lookup(req, body);
    }
    @Post() @Permission(permission + ":create") create(
      @Req() req: AuthRequest,
      @Body() body: unknown,
    ) {
      return this.app.records.create(req, body);
    }
    @Patch(":id") @Permission(permission + ":update") update(
      @Req() req: AuthRequest,
      @Param("id", ParseIntPipe) id: number,
      @Body() body: unknown,
    ) {
      return this.app.records.update(req, id, body);
    }
    @Post(":id/:action") @Permission(act) run(
      @Req() req: AuthRequest,
      @Param("id", ParseIntPipe) id: number,
      @Param("action") action: string,
      @Body() body: unknown,
    ) {
      return this.app.run(req, id, action, body);
    }
  }
  return AppController;
}
