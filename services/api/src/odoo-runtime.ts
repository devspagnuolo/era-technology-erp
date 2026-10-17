import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Inject,
  Injectable,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UnprocessableEntityException,
} from "@nestjs/common";
import type { Response } from "express";
import { z } from "zod";
import { AuthRequest, Permission, Public, parse } from "./auth";
import { Domain } from "./odoo";
import { ArchNode, parseArch } from "./odoo-arch";
import { ButtonDef, FormSchema, OdooForms, htmlToText } from "./odoo-form";
import { pyContext, pyDomain, pyEval } from "./odoo-pyval";
import { forAudit } from "./odoo-records";
import { OdooScope } from "./odoo-scope";
import { can } from "../../../packages/shared/security";

// Motor genérico: qualquer aplicativo instalado no Odoo funciona dentro da
// ERA a partir dos próprios menus, ações e telas do Odoo (lista, formulário,
// botões, assistentes, relatórios, mensagens, aplicativos e configurações).
// Os módulos com tela própria da ERA (Vendas, Estoque...) continuam valendo;
// este motor cobre todo o resto, sem o usuário precisar abrir o Odoo.
type Values = Record<string, unknown>;
type Row = Values & { id: number };

export const MODEL = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/;
// Modelos técnicos do Odoo (usuários, grupos, configuração interna) ficam
// fora: usuários e perfis são administrados pela própria ERA.
const BLOCKED = /^(ir\.|res\.users|res\.groups|bus\.|auth_|iap\.|base\.module)/;
// Configurações e assistentes de instalação valem para todo o Odoo.
const ADMIN = /^(res\.config|base\.|ir\.module)/;
export function modelAccess(model: string): "blocked" | "admin" | "open" {
  if (!MODEL.test(model)) return "blocked";
  if (ADMIN.test(model)) return "admin";
  if (BLOCKED.test(model)) return "blocked";
  return "open";
}

// Contexto vindo do navegador: nunca troca empresa, usuário ou idioma.
const UNSAFE = new Set([
  "allowed_company_ids",
  "force_company",
  "company_id",
  "uid",
  "su",
  "lang",
  "tz",
  "install_mode",
  "module",
  "tracking_disable",
]);
export function safeContext(raw: unknown): Values {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Values = {};
  for (const [key, value] of Object.entries(raw)) {
    if (UNSAFE.has(key) || key.startsWith("_")) continue;
    if (!/^[\w.]{1,80}$/.test(key)) continue;
    out[key] = value;
  }
  return JSON.stringify(out).length > 20000 ? {} : out;
}

// Chave do formulário no caminho da rota: tela específica e contexto.
export type FormKey = { view?: number; context?: Values };
export function decodeKey(raw: string): FormKey {
  if (!raw || raw === "_") return {};
  try {
    const parsed = JSON.parse(
      Buffer.from(raw, "base64url").toString("utf8"),
    ) as FormKey;
    const view = Number(parsed.view);
    return {
      ...(Number.isInteger(view) && view > 0 ? { view } : {}),
      context: safeContext(parsed.context),
    };
  } catch {
    throw new BadRequestException("Tela inválida");
  }
}

export type Menu = {
  id: number;
  name: string;
  xmlid: string;
  action: number | null;
  icon?: string;
  children: Menu[];
};
export type RunAction =
  | {
      kind: "window";
      id: number | null;
      title: string;
      model: string;
      resId: number | null;
      target: string;
      views: { list?: number; form?: number; search?: number };
      modes: string[];
      context: Values;
      // Domínio da ação (null: o Odoo usa datas relativas que a ERA não avalia).
      domain: unknown[] | null;
      help: string | null;
    }
  | { kind: "reload" }
  | { kind: "message"; title: string; message: string }
  | { kind: "report"; report: string; ids: number[]; title: string };

type Column = {
  name: string;
  label: string;
  type: string;
  widget?: string;
  selection?: Array<[string, string]>;
};
type SearchFilter = { name: string; label: string; group: number };

type MenuRow = {
  id: number | string;
  name: string;
  children: number[];
  xmlid: string;
  action?: string | false; // "ir.actions.act_window,123"
  web_icon_data?: string | false;
  web_icon_data_mimetype?: string | false;
};

const listInput = z.object({
  model: z.string().regex(MODEL).optional(),
  action: z.coerce.number().int().positive().optional(),
  q: z.string().trim().max(100).default(""),
  filters: z.string().trim().max(400).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
  context: z.string().max(20000).optional(),
  domain: z.string().max(20000).optional(),
});

@Injectable()
export class OdooRuntime {
  private menuCache = new Map<number, { at: number; menus: Promise<Menu[]> }>();
  private views = new Map<
    string,
    {
      at: number;
      value: Promise<{
        list: ArchNode;
        search: ArchNode;
        fields: Record<string, FieldMeta>;
      }>;
    }
  >();
  private models = new Map<string, Promise<ModelInfo>>();
  constructor(
    @Inject(OdooScope) private scope: OdooScope,
    @Inject(OdooForms) private forms: OdooForms,
  ) {}

  private call<T>(
    companyId: number,
    model: string,
    method: string,
    args: unknown[],
    kwargs: Values = {},
    timeoutMs?: number,
  ) {
    return this.forms.call<T>(
      companyId,
      model,
      method,
      args,
      kwargs,
      timeoutMs,
    );
  }

  // Permissões ERA: odoo:read para ver, odoo:write para gravar e
  // odoo:admin para configurações e aplicativos (valem para todo o Odoo).
  guard(req: AuthRequest, model: string) {
    const access = modelAccess(model);
    if (access === "blocked")
      throw new ForbiddenException("Este cadastro é administrado pela ERA");
    if (access === "admin" && !can(req.principal, "odoo:admin"))
      throw new ForbiddenException("Permissão insuficiente");
  }

  async evalScope(companyId: number, extra: Values = {}) {
    return {
      uid: await this.scope.odoo.userId(),
      allowed_company_ids: [companyId],
      company_id: companyId,
      company_ids: [companyId],
      current_company_id: companyId,
      context: {},
      ...extra,
    };
  }

  // ---- menus e ações ------------------------------------------------------

  async menus(req: AuthRequest) {
    const companyId = await this.scope.company(req);
    const cached = this.menuCache.get(companyId);
    if (cached && Date.now() - cached.at < 5 * 60 * 1000) return cached.menus;
    const menus = this.loadMenus(companyId);
    this.menuCache.set(companyId, { at: Date.now(), menus });
    menus.catch(() => this.menuCache.delete(companyId));
    return menus;
  }

  forget() {
    this.menuCache.clear();
    this.views.clear();
    this.models.clear();
  }

  private async loadMenus(companyId: number): Promise<Menu[]> {
    const rows = await this.call<Record<string, MenuRow>>(
      companyId,
      "ir.ui.menu",
      "load_menus",
      [false],
    );
    const build = (id: number, depth: number): Menu | null => {
      const row = rows[String(id)];
      if (!row) return null;
      const action =
        typeof row.action === "string"
          ? Number(row.action.split(",")[1]) || null
          : null;
      const children = (row.children ?? [])
        .map((child) => build(child, depth + 1))
        .filter((m): m is Menu => !!m);
      if (!action && !children.length) return null;
      const menu: Menu = {
        id: Number(row.id),
        name: row.name,
        xmlid: row.xmlid ?? "",
        action,
        children,
      };
      if (depth === 0 && row.web_icon_data)
        menu.icon =
          "data:" +
          (row.web_icon_data_mimetype ||
            (row.web_icon_data.startsWith("PHN2")
              ? "image/svg+xml"
              : "image/png")) +
          ";base64," +
          row.web_icon_data;
      return menu;
    };
    return (rows.root?.children ?? [])
      .map((id) => build(id, 0))
      .filter((m): m is Menu => !!m);
  }

  async action(req: AuthRequest, id: number, extra: Values = {}) {
    const companyId = await this.scope.company(req);
    return this.loadAction(companyId, id, extra);
  }

  private async loadAction(
    companyId: number,
    id: number,
    extra: Values = {},
  ): Promise<RunAction> {
    const [base] = await this.call<Array<{ type: string }>>(
      companyId,
      "ir.actions.actions",
      "read",
      [[id], ["type"]],
    );
    if (!base) throw new NotFoundException("Ação não encontrada");
    const [row] = await this.call<Values[]>(companyId, base.type, "read", [
      [id],
    ]);
    return this.normalize(companyId, { ...row, type: base.type }, extra);
  }

  // Resultado de ação/botão do Odoo → o que o painel da ERA sabe abrir.
  async normalize(
    companyId: number,
    raw: unknown,
    extra: Values = {},
  ): Promise<RunAction> {
    if (!raw || typeof raw !== "object") return { kind: "reload" };
    const action = raw as Values;
    const type = String(action.type ?? "");
    const scope = await this.evalScope(companyId, extra);
    if (type === "ir.actions.act_window") {
      const model = String(action.res_model ?? "");
      if (!MODEL.test(model)) return { kind: "reload" };
      const context = {
        ...(typeof action.context === "object" && action.context
          ? (action.context as Values)
          : pyContext(action.context, scope)),
      };
      const domain = Array.isArray(action.domain)
        ? action.domain
        : typeof action.domain === "string"
          ? pyDomain(action.domain, scope)
          : [];
      const views: { list?: number; form?: number; search?: number } = {};
      const modes: string[] = [];
      for (const pair of (action.views as Array<[number | false, string]>) ??
        []) {
        const [viewId, mode] = pair;
        modes.push(mode);
        if ((mode === "list" || mode === "tree") && viewId) views.list = viewId;
        if (mode === "form" && viewId) views.form = viewId;
      }
      if (!modes.length)
        modes.push(...String(action.view_mode ?? "list,form").split(","));
      if (Array.isArray(action.search_view_id) && action.search_view_id[0])
        views.search = Number(action.search_view_id[0]);
      const resId = Number(action.res_id) || null;
      return {
        kind: "window",
        id: Number(action.id) || null,
        title: String(action.name ?? ""),
        model,
        resId,
        target: String(action.target ?? "current"),
        views,
        modes: modes.map((m) => (m === "tree" ? "list" : m)),
        context,
        domain,
        help: action.help ? htmlToText(action.help) || null : null,
      };
    }
    if (type === "ir.actions.report") {
      const ids = (
        Array.isArray(extra.active_ids) ? extra.active_ids : []
      ) as number[];
      const contextIds = (action.context as Values | undefined)?.active_ids;
      return {
        kind: "report",
        report: String(action.report_name ?? ""),
        ids: Array.isArray(contextIds) ? (contextIds as number[]) : ids,
        title: String(action.name ?? "Relatório"),
      };
    }
    if (type === "ir.actions.client") {
      const params = (action.params ?? {}) as Values;
      if (action.tag === "display_notification")
        return {
          kind: "message",
          title: String(params.title ?? "Odoo"),
          message: String(params.message ?? ""),
        };
      if (action.tag === "reload" || action.tag === "soft_reload")
        return { kind: "reload" };
      // Conversas (Discuss): canais e mensagens viram lista + histórico.
      if (action.tag === "mail.action_discuss")
        return {
          kind: "window",
          id: null,
          title: String(action.name ?? "Conversas"),
          model: "discuss.channel",
          resId: null,
          target: "current",
          views: {},
          modes: ["list", "form"],
          context: {},
          domain: [],
          help: null,
        };
      return {
        kind: "message",
        title: String(action.name ?? "Odoo"),
        message:
          "Esta tela do Odoo é um painel interativo próprio do Odoo; os dados dela estão disponíveis nos menus de cadastros e relatórios deste aplicativo.",
      };
    }
    if (type === "ir.actions.server") {
      const result = await this.call(
        companyId,
        "ir.actions.server",
        "run",
        [[Number(action.id)]],
        { context: safeContext(extra) },
      );
      return this.normalize(companyId, result, extra);
    }
    if (type === "ir.actions.act_url")
      return {
        kind: "message",
        title: String(action.name ?? "Odoo"),
        message:
          "Este link do Odoo abre um endereço externo, que a ERA não exibe.",
      };
    return { kind: "reload" };
  }

  // ---- lista --------------------------------------------------------------

  async list(req: AuthRequest, raw: unknown) {
    const input = parse(listInput, raw);
    const companyId = await this.scope.company(req);
    let action: Extract<RunAction, { kind: "window" }> | null = null;
    if (input.action) {
      const loaded = await this.loadAction(companyId, input.action);
      if (loaded.kind !== "window")
        throw new UnprocessableEntityException("Esta ação não é uma lista");
      action = loaded;
    }
    const model = action?.model ?? input.model;
    if (!model) throw new BadRequestException("Informe o cadastro");
    this.guard(req, model);
    const extraContext = input.context ? safeContext(json(input.context)) : {};
    const context = { ...(action?.context ?? {}), ...extraContext };
    const actionDomain = (action?.domain ?? []) as Domain;
    // Recorte vindo de um botão (ex.: pagamentos da fatura): é só um filtro;
    // as regras de empresa do Odoo continuam valendo.
    const extra = input.domain ? json(input.domain) : [];
    if (!Array.isArray(extra)) throw new BadRequestException("Filtro inválido");
    const extraDomain = extra as Domain;
    const view = await this.listView(companyId, model, action?.views, context);
    const scope = await this.evalScope(companyId, { context });
    const columns = this.columns(view.list, view.fields, context);
    const { filters, domains, defaults } = this.searchFilters(
      view.search,
      scope,
      context,
    );
    const selected = input.filters
      ? input.filters.split(",").filter((name) => domains[name])
      : defaults;
    const domain: Domain = [...actionDomain, ...extraDomain];
    const groups = new Map<number, Domain[]>();
    for (const name of selected) {
      const group = filters.find((f) => f.name === name)!.group;
      groups.set(group, [...(groups.get(group) ?? []), domains[name]]);
    }
    for (const parts of groups.values()) {
      for (let i = 1; i < parts.length; i++) domain.push("|");
      for (const part of parts) domain.push(...part);
    }
    if (input.q) {
      const terms = this.searchTerms(view.search, view.fields, input.q, scope);
      for (let i = 1; i < terms.length; i++) domain.push("|");
      for (const term of terms) domain.push(...term);
    }
    const spec: Values = {};
    for (const column of columns)
      spec[column.name] = ["many2one", "many2many"].includes(column.type)
        ? { fields: { display_name: {} } }
        : {};
    if (view.fields.currency_id && !spec.currency_id)
      spec.currency_id = { fields: { display_name: {} } };
    spec.display_name = {};
    const order = view.list.attrs.default_order;
    const result = await this.call<{ length: number; records: Row[] }>(
      companyId,
      model,
      "web_search_read",
      [],
      {
        domain,
        specification: spec,
        offset: (input.page - 1) * input.pageSize,
        limit: input.pageSize,
        ...(order ? { order } : {}),
        context: { ...stripSearch(context), bin_size: true },
      },
    );
    const info = await this.modelInfo(companyId, model);
    const attr = (name: string) => view.list.attrs[name];
    const no = (value?: string) => value === "0" || value === "false";
    return {
      title: action?.title ?? info.name,
      model,
      columns,
      filters,
      selected,
      rows: result.records.map((row) => this.cells(row, columns)),
      total: result.length,
      page: input.page,
      pageSize: input.pageSize,
      help: action?.help ?? null,
      canCreate: !no(attr("create")) && !info.transient,
      canDelete: !no(attr("delete")),
      formView: action?.views.form ?? null,
      context: stripSearch(context),
    };
  }

  private async listView(
    companyId: number,
    model: string,
    views: { list?: number; search?: number } | undefined,
    context: Values,
  ) {
    const key = model + ":" + (views?.list ?? 0) + ":" + (views?.search ?? 0);
    const cached = this.views.get(key);
    if (cached && Date.now() - cached.at < 10 * 60 * 1000) return cached.value;
    const value = this.call<{
      views: { list: { arch: string }; search: { arch: string } };
      models: Record<string, { fields: Record<string, FieldMeta> }>;
    }>(
      companyId,
      model,
      "get_views",
      [
        [
          [views?.list ?? false, "list"],
          [views?.search ?? false, "search"],
        ],
      ],
      { context: stripSearch(context) },
    ).then((result) => ({
      list: firstTag(parseArch(result.views.list.arch), ["list", "tree"]),
      search: firstTag(parseArch(result.views.search.arch), ["search"]),
      fields: result.models[model]?.fields ?? {},
    }));
    this.views.set(key, { at: Date.now(), value });
    value.catch(() => this.views.delete(key));
    return value;
  }

  private columns(
    list: ArchNode,
    fields: Record<string, FieldMeta>,
    context: Values,
  ) {
    const columns: Column[] = [];
    for (const node of list.children) {
      if (node.tag !== "field") continue;
      const { name, string, optional, widget } = node.attrs;
      const meta = fields[name];
      if (!meta || optional === "hide") continue;
      if (isStaticTrue(node.attrs.column_invisible)) continue;
      // Colunas que dependem do contexto da ação (ex.: cliente x fornecedor).
      if (node.attrs.column_invisible) {
        const hidden = pyEval(node.attrs.column_invisible, { context });
        if (hidden.ok && hidden.value) continue;
      }
      if (isStaticTrue(node.attrs.invisible)) continue;
      if (["one2many", "binary", "html", "properties"].includes(meta.type))
        continue;
      if (widget && ["handle", "activity_exception"].includes(widget)) continue;
      if (columns.some((c) => c.name === name)) continue;
      columns.push({
        name,
        label: string || meta.string,
        type: meta.type,
        ...(widget ? { widget } : {}),
        ...(meta.selection ? { selection: meta.selection } : {}),
      });
      if (columns.length >= 10) break;
    }
    if (!columns.length)
      columns.push({ name: "display_name", label: "Nome", type: "char" });
    return columns;
  }

  private cells(row: Row, columns: Column[]) {
    const values: Values = {};
    for (const column of columns) {
      const raw = row[column.name];
      if (column.type === "many2one")
        values[column.name] =
          raw && typeof raw === "object"
            ? (raw as { display_name?: string }).display_name
            : null;
      else if (column.type === "many2many")
        values[column.name] = Array.isArray(raw)
          ? raw
              .map((r) => (r as { display_name?: string }).display_name)
              .join(", ")
          : "";
      else if (column.selection)
        values[column.name] =
          column.selection.find(([key]) => key === raw)?.[1] ??
          (raw === false ? null : raw);
      else values[column.name] = raw === false ? null : raw;
    }
    const currency = row.currency_id as { display_name?: string } | false;
    return {
      id: row.id,
      name: String(row.display_name ?? ""),
      values,
      ...(currency ? { currency: currency.display_name } : {}),
    };
  }

  private searchFilters(search: ArchNode, scope: Values, context: Values) {
    const filters: SearchFilter[] = [];
    const domains: Record<string, Domain> = {};
    const defaults: string[] = [];
    let group = 0;
    const walk = (node: ArchNode) => {
      for (const child of node.children) {
        if (child.tag === "separator") group++;
        else if (child.tag === "group") walk(child);
        else if (child.tag === "filter") {
          const { name, string, domain } = child.attrs;
          if (!name || !string || !domain) continue;
          if (isStaticTrue(child.attrs.invisible)) continue;
          const evaluated = pyDomain(domain, scope);
          if (!evaluated) continue;
          filters.push({ name, label: string, group });
          domains[name] = evaluated as Domain;
          if (context["search_default_" + name]) defaults.push(name);
        }
      }
      group++;
    };
    walk(search);
    return { filters, domains, defaults };
  }

  private searchTerms(
    search: ArchNode,
    fields: Record<string, FieldMeta>,
    q: string,
    scope: Values,
  ) {
    const terms: Domain[] = [];
    for (const node of search.children) {
      if (node.tag !== "field" || terms.length >= 4) continue;
      const { name, filter_domain, operator } = node.attrs;
      const meta = fields[name];
      if (!meta || isStaticTrue(node.attrs.invisible)) continue;
      if (filter_domain) {
        const evaluated = pyDomain(filter_domain, {
          ...scope,
          self: q,
          raw_value: q,
        });
        if (evaluated?.length) terms.push(evaluated as Domain);
        continue;
      }
      if (
        !["char", "text", "many2one", "many2many", "selection"].includes(
          meta.type,
        ) &&
        !(operator && operator !== "ilike")
      )
        continue;
      terms.push([[name, operator || "ilike", q]]);
    }
    if (!terms.length) terms.push([["display_name", "ilike", q]]);
    return terms;
  }

  // ---- formulário genérico -----------------------------------------------

  async modelInfo(companyId: number, model: string) {
    let cached = this.models.get(model);
    if (!cached) {
      cached = (async () => {
        const [row] = await this.call<
          Array<{ name: string; transient: boolean }>
        >(companyId, "ir.model", "search_read", [[["model", "=", model]]], {
          fields: ["name", "transient"],
        });
        if (!row) throw new NotFoundException("Cadastro não encontrado");
        const fields = await this.call<Values>(
          companyId,
          model,
          "fields_get",
          [["message_ids", "active"]],
          { attributes: ["type"] },
        );
        const reports = await this.call<
          Array<{ id: number; name: string; report_name: string }>
        >(
          companyId,
          "ir.actions.report",
          "search_read",
          [
            [
              ["model", "=", model],
              ["binding_model_id", "!=", false],
              ["report_type", "=", "qweb-pdf"],
            ],
          ],
          { fields: ["name", "report_name"] },
        );
        return {
          name: row.name,
          transient: row.transient,
          chatter: "message_ids" in fields,
          archivable: "active" in fields,
          reports: reports.map((r) => ({
            name: r.name,
            report: r.report_name,
          })),
        };
      })();
      cached.catch(() => this.models.delete(model));
      this.models.set(model, cached);
    }
    return cached;
  }

  private schema(companyId: number, model: string, key: FormKey) {
    return this.forms.schema(companyId, model, {
      buttons: true,
      ...(key.view ? { viewId: key.view } : {}),
    });
  }

  private async find(companyId: number, schema: FormSchema, id: number) {
    const record = await this.forms.read(companyId, schema, [["id", "=", id]]);
    if (!record) throw new NotFoundException("Registro não encontrado");
    return record;
  }

  async form(req: AuthRequest, model: string, key: FormKey, id?: number) {
    this.guard(req, model);
    const companyId = await this.scope.company(req);
    const schema = await this.schema(companyId, model, key);
    const info = await this.modelInfo(companyId, model);
    const values = id
      ? await this.find(companyId, schema, id)
      : await this.forms.defaults(companyId, schema, key.context ?? {});
    let title = info.name;
    if (id) {
      const [row] = await this.call<Array<{ display_name: string }>>(
        companyId,
        model,
        "read",
        [[id], ["display_name"]],
      );
      title = row?.display_name || title;
    }
    return {
      schema,
      values,
      title,
      model: info,
    };
  }

  async onchange(
    req: AuthRequest,
    model: string,
    key: FormKey,
    body: unknown,
    id?: number,
  ) {
    this.guard(req, model);
    const companyId = await this.scope.company(req);
    const schema = await this.schema(companyId, model, key);
    if (id) await this.find(companyId, schema, id);
    return this.forms.onchange(companyId, schema, body, id, key.context);
  }

  async lookup(req: AuthRequest, model: string, key: FormKey, body: unknown) {
    this.guard(req, model);
    const companyId = await this.scope.company(req);
    const schema = await this.schema(companyId, model, key);
    return this.forms.lookup(companyId, schema, body, key.context);
  }

  async save(
    req: AuthRequest,
    model: string,
    key: FormKey,
    raw: unknown,
    id?: number,
  ) {
    this.guard(req, model);
    const companyId = await this.scope.company(req);
    const schema = await this.schema(companyId, model, key);
    const before = id ? await this.find(companyId, schema, id) : null;
    const values = await this.forms.values(
      companyId,
      schema,
      (raw as { values?: unknown })?.values ?? {},
      before ?? {},
    );
    const context = key.context ?? {};
    let recordId = id;
    if (id) {
      if (Object.keys(values).length)
        await this.call(companyId, model, "write", [[id], values], {
          context,
        });
    } else {
      [recordId] = await this.call<number[]>(
        companyId,
        model,
        "create",
        [[values]],
        { context },
      );
    }
    const info = await this.modelInfo(companyId, model);
    if (!info.transient) {
      const after = await this.find(companyId, schema, recordId!);
      await this.scope.audit(
        req,
        "odoo.run",
        model,
        id ? "update" : "create",
        recordId!,
        before ? forAudit(before) : null,
        forAudit(after),
      );
    }
    return { id: recordId };
  }

  // Botão do formulário: só os que a tela do Odoo mostra para o registro.
  async button(
    req: AuthRequest,
    model: string,
    key: FormKey,
    id: number,
    raw: unknown,
  ) {
    this.guard(req, model);
    const companyId = await this.scope.company(req);
    const schema = await this.schema(companyId, model, key);
    const button = pickButton(schema, raw);
    const record = await this.find(companyId, schema, id);
    const result = await this.press(
      companyId,
      model,
      id,
      button,
      key.context ?? {},
      record,
    );
    const info = await this.modelInfo(companyId, model);
    if (!info.transient)
      await this.scope.audit(
        req,
        "odoo.run",
        model,
        button.name,
        id,
        forAudit(record),
        { button: button.label },
      );
    return result;
  }

  // Assistente (wizard): grava o rascunho e aciona o botão escolhido.
  async wizard(req: AuthRequest, model: string, key: FormKey, raw: unknown) {
    this.guard(req, model);
    const companyId = await this.scope.company(req);
    const schema = await this.schema(companyId, model, key);
    const button = pickButton(schema, raw);
    const context = key.context ?? {};
    const values = await this.forms.values(
      companyId,
      schema,
      (raw as { values?: unknown })?.values ?? {},
      {},
    );
    const [id] = await this.call<number[]>(
      companyId,
      model,
      "create",
      [[values]],
      { context },
    );
    const record = await this.find(companyId, schema, id);
    const result = await this.press(
      companyId,
      model,
      id,
      button,
      context,
      record,
    );
    // Configurações gravadas valem para todo o Odoo: menus podem mudar.
    if (model === "res.config.settings") {
      this.forget();
      this.forms.forget();
    }
    const activeModel = String(context.active_model ?? "");
    const activeIds = (context.active_ids as number[] | undefined) ?? [];
    if (MODEL.test(activeModel) && activeIds.length)
      await this.scope.audit(
        req,
        "odoo.run",
        activeModel,
        button.name,
        Number(activeIds[0]),
        null,
        { wizard: model, button: button.label },
      );
    return result;
  }

  private async press(
    companyId: number,
    model: string,
    id: number,
    button: ButtonDef,
    baseContext: Values,
    record: Values,
  ) {
    const plain: Values = {};
    for (const [name, value] of Object.entries(record))
      plain[name] =
        value && typeof value === "object" && "id" in value
          ? (value as { id: number }).id
          : Array.isArray(value)
            ? value.map((v) =>
                v && typeof v === "object" && "id" in v
                  ? (v as { id: number }).id
                  : v,
              )
            : value;
    const scope = await this.evalScope(companyId, {
      ...plain,
      id,
      active_id: id,
      active_ids: [id],
      active_model: model,
      context: baseContext,
    });
    const context: Values = {
      ...baseContext,
      ...safeContext(pyContext(button.context, scope)),
    };
    const active = { active_id: id, active_ids: [id], active_model: model };
    if (button.type === "action") {
      const actionId = Number(button.name);
      if (!Number.isInteger(actionId))
        throw new UnprocessableEntityException("Ação do Odoo inválida");
      const action = await this.loadAction(companyId, actionId, {
        ...context,
        ...active,
      });
      if (action.kind === "window")
        action.context = {
          ...action.context,
          ...context,
          ...active,
        };
      if (action.kind === "report" && !action.ids.length) action.ids = [id];
      return action;
    }
    const result = await this.call(
      companyId,
      model,
      button.name,
      [[id]],
      { context },
      // Configurações podem instalar aplicativos: até alguns minutos.
      model === "res.config.settings" ? 10 * 60 * 1000 : 120000,
    );
    const action = await this.normalize(companyId, result, {
      ...context,
      ...active,
    });
    if (action.kind === "window" && action.target === "new")
      action.context = { ...active, ...action.context };
    if (action.kind === "report" && !action.ids.length) action.ids = [id];
    return action;
  }

  async remove(req: AuthRequest, model: string, id: number) {
    this.guard(req, model);
    const companyId = await this.scope.company(req);
    const schema = await this.schema(companyId, model, {});
    const before = await this.find(companyId, schema, id);
    await this.call(companyId, model, "unlink", [[id]]);
    await this.scope.audit(
      req,
      "odoo.run",
      model,
      "delete",
      id,
      forAudit(before),
      {},
    );
    return { ok: true };
  }

  async archive(req: AuthRequest, model: string, id: number, active: boolean) {
    this.guard(req, model);
    const companyId = await this.scope.company(req);
    const schema = await this.schema(companyId, model, {});
    await this.find(companyId, schema, id);
    await this.call(
      companyId,
      model,
      active ? "action_unarchive" : "action_archive",
      [[id]],
    );
    await this.scope.audit(
      req,
      "odoo.run",
      model,
      active ? "activate" : "deactivate",
      id,
      null,
      { active },
    );
    return { ok: true };
  }

  // ---- mensagens do registro (chatter) -----------------------------------

  async messages(req: AuthRequest, model: string, id: number) {
    this.guard(req, model);
    const companyId = await this.scope.company(req);
    const schema = await this.schema(companyId, model, {});
    await this.find(companyId, schema, id);
    const rows = await this.call<
      Array<{
        id: number;
        body: string;
        date: string;
        author_id: [number, string] | false;
        message_type: string;
        subtype_id: [number, string] | false;
        tracking_value_ids: number[];
      }>
    >(
      companyId,
      "mail.message",
      "search_read",
      [
        [
          ["model", "=", model],
          ["res_id", "=", id],
          ["message_type", "in", ["comment", "notification", "email"]],
        ],
      ],
      {
        fields: [
          "body",
          "date",
          "author_id",
          "message_type",
          "subtype_id",
          "tracking_value_ids",
        ],
        limit: 50,
        order: "id desc",
      },
    );
    const trackingIds = rows.flatMap((r) => r.tracking_value_ids);
    const tracking = trackingIds.length
      ? await this.call<
          Array<{
            id: number;
            field_id: [number, string] | false;
            old_value_char: string | false;
            new_value_char: string | false;
            old_value_integer: number;
            new_value_integer: number;
            old_value_float: number;
            new_value_float: number;
            old_value_datetime: string | false;
            new_value_datetime: string | false;
          }>
        >(companyId, "mail.tracking.value", "read", [trackingIds]).catch(
          () => [],
        )
      : [];
    const byId = new Map(tracking.map((t) => [t.id, t]));
    return rows.map((row) => ({
      id: row.id,
      date: row.date,
      author: row.author_id ? row.author_id[1] : null,
      note: row.subtype_id ? /nota|note/i.test(row.subtype_id[1]) : false,
      body: htmlToText(row.body) ?? "",
      changes: row.tracking_value_ids
        .map((tid) => byId.get(tid))
        .filter(Boolean)
        .map((t) => ({
          field: t!.field_id ? t!.field_id[1] : "",
          from:
            t!.old_value_char ||
            t!.old_value_datetime ||
            (t!.old_value_float || t!.old_value_integer || "") + "",
          to:
            t!.new_value_char ||
            t!.new_value_datetime ||
            (t!.new_value_float || t!.new_value_integer || "") + "",
        })),
    }));
  }

  async post(req: AuthRequest, model: string, id: number, raw: unknown) {
    this.guard(req, model);
    const body = parse(
      z.object({
        body: z.string().trim().min(1).max(10000),
        note: z.boolean().default(true),
      }),
      raw,
    );
    const companyId = await this.scope.company(req);
    const schema = await this.schema(companyId, model, {});
    await this.find(companyId, schema, id);
    await this.call(companyId, model, "message_post", [[id]], {
      body: escapeHtml(body.body).replace(/\n/g, "<br/>"),
      message_type: "comment",
      subtype_xmlid: body.note ? "mail.mt_note" : "mail.mt_comment",
    });
    return { ok: true };
  }

  // ---- relatórios em PDF --------------------------------------------------

  async report(req: AuthRequest, name: string, rawIds: string) {
    if (!/^[\w.]+$/.test(name))
      throw new BadRequestException("Relatório inválido");
    const ids = rawIds
      .split(",")
      .map(Number)
      .filter((id) => Number.isInteger(id) && id > 0)
      .slice(0, 100);
    if (!ids.length) throw new BadRequestException("Informe os registros");
    const companyId = await this.scope.company(req);
    const [report] = await this.call<Array<{ model: string; name: string }>>(
      companyId,
      "ir.actions.report",
      "search_read",
      [[["report_name", "=", name]]],
      { fields: ["model", "name"], limit: 1 },
    );
    if (!report) throw new NotFoundException("Relatório não encontrado");
    this.guard(req, report.model);
    // Só registros que a empresa enxerga no Odoo.
    const visible = await this.call<number>(
      companyId,
      report.model,
      "search_count",
      [[["id", "in", ids]]],
      { context: { active_test: false } },
    );
    if (visible !== ids.length)
      throw new NotFoundException("Registro não encontrado");
    const file = await this.scope.odoo.download(
      "/report/pdf/" +
        name +
        "/" +
        ids.join(",") +
        "?context=" +
        encodeURIComponent(
          JSON.stringify({ allowed_company_ids: [companyId], lang: "pt_BR" }),
        ),
    );
    return { ...file, name: report.name };
  }

  // ---- aplicativos --------------------------------------------------------

  async apps(req: AuthRequest, raw: unknown) {
    const input = parse(
      z.object({
        q: z.string().trim().max(100).default(""),
        filter: z.enum(["apps", "installed", "all"]).default("apps"),
      }),
      raw,
    );
    const companyId = await this.scope.company(req);
    // Aplicativos sem instalação possível (versão Enterprise) ficam de fora.
    const domain: Domain = [["state", "!=", "uninstallable"]];
    if (input.filter === "apps") domain.push(["application", "=", true]);
    if (input.filter === "installed") domain.push(["state", "=", "installed"]);
    if (input.q)
      domain.push(
        "|",
        "|",
        ["shortdesc", "ilike", input.q],
        ["name", "ilike", input.q],
        ["summary", "ilike", input.q],
      );
    const rows = await this.call<
      Array<{
        id: number;
        name: string;
        shortdesc: string;
        summary: string | false;
        state: string;
        application: boolean;
        icon: string | false;
        category_id: [number, string] | false;
      }>
    >(companyId, "ir.module.module", "search_read", [domain], {
      fields: [
        "name",
        "shortdesc",
        "summary",
        "state",
        "application",
        "icon",
        "category_id",
      ],
      order: "application desc, sequence, shortdesc",
      limit: 200,
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      title: row.shortdesc,
      summary: row.summary || null,
      state: row.state,
      application: row.application,
      category: row.category_id ? row.category_id[1] : null,
      icon:
        row.icon && /^\/[\w.-]+\/static\/[\w./-]+\.(png|svg)$/.test(row.icon)
          ? row.icon
          : null,
    }));
  }

  async moduleOp(
    req: AuthRequest,
    id: number,
    op: "install" | "uninstall" | "upgrade",
  ) {
    const companyId = await this.scope.company(req);
    const [module] = await this.call<
      Array<{ name: string; shortdesc: string; state: string }>
    >(companyId, "ir.module.module", "read", [
      [id],
      ["name", "shortdesc", "state"],
    ]);
    if (!module) throw new NotFoundException("Aplicativo não encontrado");
    if (["base", "web", "mail"].includes(module.name) && op === "uninstall")
      throw new UnprocessableEntityException(
        "Este aplicativo é essencial e não pode ser removido",
      );
    const method = {
      install: "button_immediate_install",
      uninstall: "button_immediate_uninstall",
      upgrade: "button_immediate_upgrade",
    }[op];
    // A instalação recarrega o Odoo e pode levar alguns minutos.
    await this.call(
      companyId,
      "ir.module.module",
      method,
      [[id]],
      {},
      10 * 60 * 1000,
    );
    this.forget();
    this.forms.forget();
    await this.scope.audit(
      req,
      "odoo.apps",
      "ir.module.module",
      op,
      id,
      {
        state: module.state,
      },
      { name: module.name, title: module.shortdesc },
    );
    const [after] = await this.call<Array<{ state: string }>>(
      companyId,
      "ir.module.module",
      "read",
      [[id], ["state"]],
    );
    return { id, state: after?.state ?? module.state };
  }

  async icon(path: string) {
    if (!/^\/[\w.-]+\/static\/[\w./-]+\.(png|svg)$/.test(path))
      throw new BadRequestException("Ícone inválido");
    return this.scope.odoo.staticFile(path);
  }
}

type FieldMeta = {
  type: string;
  string: string;
  selection?: Array<[string, string]>;
};
type ModelInfo = {
  name: string;
  transient: boolean;
  chatter: boolean;
  archivable: boolean;
  reports: Array<{ name: string; report: string }>;
};

function json(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    throw new BadRequestException("Dados inválidos");
  }
}
function firstTag(node: ArchNode, tags: string[]): ArchNode {
  if (tags.includes(node.tag)) return node;
  for (const child of node.children) {
    const found = firstTag(child, tags);
    if (found.tag !== "#none") return found;
  }
  return node.tag === "#root"
    ? { tag: tags[0], attrs: {}, children: [] }
    : { tag: "#none", attrs: {}, children: [] };
}
const isStaticTrue = (value?: string) =>
  !!value && ["1", "True", "true"].includes(value.trim());
function stripSearch(context: Values) {
  return Object.fromEntries(
    Object.entries(context).filter(
      ([key]) => !key.startsWith("search_default_"),
    ),
  );
}
function pickButton(schema: FormSchema, raw: unknown): ButtonDef {
  const name = String((raw as { name?: unknown })?.name ?? "");
  // Salvar das configurações: o Odoo desenha esse botão fora da tela.
  if (schema.model === "res.config.settings" && name === "execute")
    return { name, type: "object", label: "Salvar" };
  const button = (schema.buttons ?? []).find((b) => b.name === name);
  if (!button)
    throw new UnprocessableEntityException(
      "Este botão não está disponível nesta tela",
    );
  return button;
}
function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---- rotas ----------------------------------------------------------------

@Controller("odoo/run")
export class OdooRuntimeController {
  constructor(@Inject(OdooRuntime) private run: OdooRuntime) {}

  @Get("menus") @Permission("odoo:read") menus(@Req() req: AuthRequest) {
    return this.run.menus(req);
  }
  @Get("action/:id") @Permission("odoo:read") action(
    @Req() req: AuthRequest,
    @Param("id", ParseIntPipe) id: number,
  ) {
    return this.run.action(req, id);
  }
  @Get("list") @Permission("odoo:read") list(
    @Req() req: AuthRequest,
    @Query() query: unknown,
  ) {
    return this.run.list(req, query);
  }
  @Get("m/:model/:key/form") @Permission("odoo:read") form(
    @Req() req: AuthRequest,
    @Param("model") model: string,
    @Param("key") key: string,
    @Query("id") id?: string,
  ) {
    return this.run.form(req, model, decodeKey(key), optionalId(id));
  }
  @Get("m/:model/:key/:id/form") @Permission("odoo:read") recordForm(
    @Req() req: AuthRequest,
    @Param("model") model: string,
    @Param("key") key: string,
    @Param("id", ParseIntPipe) id: number,
  ) {
    return this.run.form(req, model, decodeKey(key), id);
  }
  @Post("m/:model/:key/onchange") @Permission("odoo:read") onchange(
    @Req() req: AuthRequest,
    @Param("model") model: string,
    @Param("key") key: string,
    @Body() body: unknown,
    @Query("id") id?: string,
  ) {
    return this.run.onchange(req, model, decodeKey(key), body, optionalId(id));
  }
  @Post("m/:model/:key/lookup") @Permission("odoo:read") lookup(
    @Req() req: AuthRequest,
    @Param("model") model: string,
    @Param("key") key: string,
    @Body() body: unknown,
  ) {
    return this.run.lookup(req, model, decodeKey(key), body);
  }
  @Post("m/:model/:key/wizard") @Permission("odoo:write") wizard(
    @Req() req: AuthRequest,
    @Param("model") model: string,
    @Param("key") key: string,
    @Body() body: unknown,
  ) {
    return this.run.wizard(req, model, decodeKey(key), body);
  }
  @Post("m/:model/:key") @Permission("odoo:write") create(
    @Req() req: AuthRequest,
    @Param("model") model: string,
    @Param("key") key: string,
    @Body() body: unknown,
  ) {
    return this.run.save(req, model, decodeKey(key), body);
  }
  @Patch("m/:model/:key/:id") @Permission("odoo:write") update(
    @Req() req: AuthRequest,
    @Param("model") model: string,
    @Param("key") key: string,
    @Param("id", ParseIntPipe) id: number,
    @Body() body: unknown,
  ) {
    return this.run.save(req, model, decodeKey(key), body, id);
  }
  @Post("m/:model/:key/:id/button") @Permission("odoo:write") button(
    @Req() req: AuthRequest,
    @Param("model") model: string,
    @Param("key") key: string,
    @Param("id", ParseIntPipe) id: number,
    @Body() body: unknown,
  ) {
    return this.run.button(req, model, decodeKey(key), id, body);
  }
  @Post("m/:model/:key/:id/active") @Permission("odoo:write") active(
    @Req() req: AuthRequest,
    @Param("model") model: string,
    @Param("id", ParseIntPipe) id: number,
    @Body() body: { active?: unknown },
  ) {
    if (typeof body?.active !== "boolean")
      throw new BadRequestException("Situação inválida");
    return this.run.archive(req, model, id, body.active);
  }
  @Delete("m/:model/:key/:id") @Permission("odoo:write") remove(
    @Req() req: AuthRequest,
    @Param("model") model: string,
    @Param("id", ParseIntPipe) id: number,
  ) {
    return this.run.remove(req, model, id);
  }
  @Get("m/:model/:key/:id/messages") @Permission("odoo:read") messages(
    @Req() req: AuthRequest,
    @Param("model") model: string,
    @Param("id", ParseIntPipe) id: number,
  ) {
    return this.run.messages(req, model, id);
  }
  @Post("m/:model/:key/:id/messages") @Permission("odoo:write") post(
    @Req() req: AuthRequest,
    @Param("model") model: string,
    @Param("id", ParseIntPipe) id: number,
    @Body() body: unknown,
  ) {
    return this.run.post(req, model, id, body);
  }
  @Get("report/:name") @Permission("odoo:read") async report(
    @Req() req: AuthRequest,
    @Param("name") name: string,
    @Query("ids") ids: string,
    @Res() res: Response,
  ) {
    const file = await this.run.report(req, name, String(ids ?? ""));
    res.setHeader("Content-Type", file.type);
    res.setHeader(
      "Content-Disposition",
      'inline; filename="' + name.replace(/[^\w.-]/g, "_") + '.pdf"',
    );
    res.send(file.data);
  }
  @Get("apps") @Permission("odoo:read") apps(
    @Req() req: AuthRequest,
    @Query() query: unknown,
  ) {
    return this.run.apps(req, query);
  }
  @Post("apps/:id/:op") @Permission("odoo:admin") moduleOp(
    @Req() req: AuthRequest,
    @Param("id", ParseIntPipe) id: number,
    @Param("op") op: string,
  ) {
    if (!["install", "uninstall", "upgrade"].includes(op))
      throw new BadRequestException("Operação inválida");
    return this.run.moduleOp(
      req,
      id,
      op as "install" | "uninstall" | "upgrade",
    );
  }
  // Ícones públicos dos aplicativos (arquivos estáticos do Odoo).
  @Public() @Get("icon") async icon(
    @Query("path") path: string,
    @Res() res: Response,
  ) {
    const file = await this.run.icon(String(path ?? ""));
    res.setHeader("Content-Type", file.type);
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send(file.data);
  }
}

function optionalId(raw?: string) {
  if (raw === undefined || raw === "") return undefined;
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1)
    throw new BadRequestException("Registro inválido");
  return id;
}
