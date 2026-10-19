import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { OdooClient, Domain } from "./odoo";
import { ArchNode, parseArch } from "./odoo-arch";
import { check, evaluate, names } from "../../../packages/shared/odoo-expr";

// Formulários completos: a ERA usa a própria tela de formulário do Odoo
// (get_views) para saber quais campos existem, como se agrupam em abas, quando
// ficam ocultos ou somente leitura e quais disparam recálculo (onchange).
// Assim, cada módulo instalado no Odoo (inclusive a localização brasileira)
// aparece na ERA sem lista de campos fixa no código.

export type FieldDef = {
  name: string;
  label: string;
  type: string;
  widget?: string;
  required: boolean;
  requiredIf?: string;
  // Campo oculto na tela do Odoo: não aparece, mas acompanha o registro
  // (preenchido pelo recálculo do Odoo e gravado), como no Odoo.
  hidden?: boolean;
  readonly: boolean;
  readonlyIf?: string;
  invisibleIf?: string;
  columnInvisibleIf?: string;
  selection?: Array<[string, string]>;
  relation?: string;
  domain?: string | unknown[];
  onChange?: boolean;
  section: string;
  help?: string;
  group?: string;
  placeholder?: string;
  sub?: SubSchema;
};
export type SubSchema = {
  model: string;
  inverse?: string;
  columns: string[];
  fields: Record<string, FieldDef>;
  deps: string[];
};
// Botão do cabeçalho do formulário do Odoo (confirmar, validar, imprimir...).
export type ButtonDef = {
  name: string;
  type: "object" | "action";
  label: string;
  invisibleIf?: string;
  context?: string;
  confirm?: string;
  primary?: boolean;
};
export type FormSchema = {
  model: string;
  sections: Array<{ title: string; fields: string[] }>;
  fields: Record<string, FieldDef>;
  deps: string[];
  buttons?: ButtonDef[];
  // Situação do cabeçalho (statusbar), exibida junto dos botões.
  status?: { name: string; selection: Array<[string, string]> };
};
type Meta = {
  name: string;
  type: string;
  string: string;
  help?: string;
  required?: boolean;
  readonly?: boolean;
  selection?: Array<[string, string]>;
  relation?: string;
  relation_field?: string;
  domain?: string | unknown[];
};
type Models = Record<string, { fields: Record<string, Meta> }>;
type Values = Record<string, unknown>;
type Ref = { id: number; name: string };
export type FormOptions = {
  // Campos que a ERA controla (empresa, situação etc.) e nunca aceita do usuário.
  locked?: string[];
  // Campos do formulário que a ERA não exibe (inclusive em itens).
  hidden?: string[];
  // Rótulos ajustados para a ERA (inclusive em itens).
  labels?: Record<string, string>;
  // Tela específica do Odoo (a da ação do menu) em vez da padrão do modelo.
  viewId?: number;
  // Inclui os botões do cabeçalho (telas genéricas da ERA).
  buttons?: boolean;
};

const SUPPORTED = new Set([
  "char",
  "text",
  "html",
  "integer",
  "float",
  "monetary",
  "boolean",
  "selection",
  "many2one",
  "many2many",
  "one2many",
  "date",
  "datetime",
  "binary",
]);
const SKIPPED_WIDGETS = new Set([
  "statinfo",
  "statusbar",
  "handle",
  "x2many_buttons",
  "boolean_favorite",
  "account-tax-totals-field",
  "stock_rescheduling_popover",
  "many2many_binary",
  "color",
  "properties",
]);
const ALWAYS = ["1", "True", "true"];
const NEVER = ["0", "False", "false"];
const IMAGE_LIMIT = 3 * 1024 * 1024;

const isStatic = (value: string | undefined) =>
  value !== undefined && ALWAYS.includes(value.trim());
function orExpr(a?: string, b?: string) {
  if (!a) return b;
  if (!b) return a;
  return "(" + a + ") or (" + b + ")";
}
function andExpr(a?: string, b?: string) {
  if (!a || !b) return undefined;
  return "(" + a + ") and (" + b + ")";
}

export function htmlToText(html: unknown) {
  if (typeof html !== "string" || !html) return null;
  return (
    html
      .replace(/<br\s*\/?>|<\/p>\s*<p[^>]*>|<\/(div|li|h\d)>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, "&")
      .trim() || null
  );
}
export function textToHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .split("\n")
    .map((part) => "<p>" + part + "</p>")
    .join("");
}

// Lê a tela de formulário do Odoo e monta o esquema da ERA.
export function buildSchema(
  model: string,
  arch: ArchNode,
  models: Models,
  options: FormOptions = {},
  extraViews: Record<string, ArchNode> = {},
): FormSchema {
  const meta = models[model]?.fields ?? {};
  const fields: Record<string, FieldDef> = {};
  const order: Array<{ section: string; name: string }> = [];
  const hidden = new Set(options.hidden ?? []);

  const walk = (
    node: ArchNode,
    section: string,
    group: string | undefined,
    invisible: string | undefined,
    off = false,
  ) => {
    const attrs = node.attrs;
    // Do cabeçalho só vem a etapa clicável (ex.: estágio do CRM, da tarefa),
    // que vira um campo comum; botões e situações fixas ficam de fora.
    if (node.tag === "header") {
      if (options.buttons) {
        collectButtons(node, invisible);
        status ??= statusOf(node);
      }
      for (const child of stages(node, meta))
        walk(
          { ...child, attrs: { ...child.attrs, widget: "stage" } },
          section,
          "Etapa",
          invisible,
          off,
        );
      return;
    }
    // Rodapé dos assistentes (wizards): os botões que concluem a etapa.
    if (node.tag === "footer") {
      if (options.buttons) collectButtons(node, invisible);
      return;
    }
    if (node.tag === "button" || node.tag === "widget") return;
    if (
      attrs.name === "button_box" ||
      (attrs.class ?? "").split(/\s+/).includes("oe_button_box") ||
      (attrs.class ?? "").split(/\s+/).includes("oe_chatter")
    )
      return;
    if (node.tag === "chatter") return;
    off = off || isStatic(attrs.invisible);
    if (off) {
      if (node.tag === "field") keepHidden(attrs);
      else
        for (const child of node.children)
          walk(child, section, group, undefined, true);
      return;
    }
    const ownInvisible =
      attrs.invisible && !NEVER.includes(attrs.invisible.trim())
        ? attrs.invisible
        : undefined;
    const scopeInvisible = orExpr(invisible, ownInvisible);
    if (node.tag === "page") section = attrs.string || attrs.name || section;
    if (node.tag === "group" && attrs.string) group = attrs.string;
    // Tela de configurações do Odoo 17+: aplicativo, bloco e configuração.
    if (node.tag === "app") section = attrs.string || attrs.name || section;
    if (node.tag === "block" && (attrs.title || attrs.string))
      group = attrs.title || attrs.string;
    if (node.tag !== "field") {
      for (const child of node.children)
        walk(child, section, group, scopeInvisible);
      return;
    }
    const name = attrs.name;
    const info = meta[name];
    if (!info || hidden.has(name)) return;
    if (!SUPPORTED.has(info.type)) return;
    const widget = attrs.widget;
    if (widget && SKIPPED_WIDGETS.has(widget)) return;
    if (info.type === "binary" && widget !== "image") return;
    const def = fieldDef(info, attrs, section, group, scopeInvisible);
    if (info.type === "one2many" || info.type === "many2many") {
      const list = node.children.find(
        (c) => c.tag === "list" || c.tag === "tree",
      );
      const form = node.children.find((c) => c.tag === "form");
      if (info.type === "one2many") {
        const view = list ?? form ?? extraViews[info.relation ?? ""];
        if (!view) return;
        def.sub = subSchema(info, view, models, hidden);
        if (!def.sub.columns.length) return;
      }
    }
    const existing = fields[name];
    if (existing?.hidden) delete fields[name];
    if (existing && !existing.hidden) {
      // Campo repetido com condições diferentes: visível se qualquer um estiver.
      existing.invisibleIf = andExpr(existing.invisibleIf, def.invisibleIf);
    } else {
      fields[name] = def;
      order.push({ section, name });
    }
    // Intervalo de datas (daterange): o Odoo mostra o fim junto do início,
    // embora o campo final fique oculto na tela; na ERA ele vira um campo
    // logo depois do início, com as mesmas condições desta ocorrência.
    const end = endDateField(attrs);
    const endInfo = end ? meta[end] : undefined;
    if (!end || !endInfo || hidden.has(end)) return;
    if (fields[end] && !fields[end].hidden) return;
    const endAttrs: Record<string, string> = {
      ...attrs,
      name: end,
      string: endInfo.string,
    };
    delete endAttrs.widget;
    delete endAttrs.options;
    fields[end] = fieldDef(endInfo, endAttrs, section, group, scopeInvisible);
    const at = order.findIndex((o) => o.name === name);
    order.splice(at + 1, 0, { section: order[at].section, name: end });
  };
  const buttons: ButtonDef[] = [];
  let status: FormSchema["status"];
  function statusOf(node: ArchNode): FormSchema["status"] {
    for (const child of node.children) {
      const { name, widget } = child.attrs;
      if (child.tag === "field" && /^statusbar/.test(widget ?? "")) {
        const info = meta[name];
        if (info?.type === "selection" && info.selection)
          return { name, selection: info.selection };
      }
      const found = child.tag === "field" ? undefined : statusOf(child);
      if (found) return found;
    }
    return undefined;
  }
  function collectButtons(node: ArchNode, invisible: string | undefined) {
    for (const child of node.children) {
      const attrs = child.attrs;
      if (isStatic(attrs.invisible)) continue;
      const own =
        attrs.invisible && !NEVER.includes(attrs.invisible.trim())
          ? attrs.invisible
          : undefined;
      if (child.tag !== "button") {
        collectButtons(child, orExpr(invisible, own));
        continue;
      }
      if (!attrs.name || !attrs.string) continue;
      if (attrs.type !== "object" && attrs.type !== "action") continue;
      const button: ButtonDef = {
        name: attrs.name,
        type: attrs.type,
        label: attrs.string,
      };
      const hide = orExpr(invisible, own);
      if (hide) button.invisibleIf = hide;
      if (attrs.context) button.context = attrs.context;
      if (attrs.confirm) button.confirm = attrs.confirm;
      if ((attrs.class ?? "").includes("btn-primary")) button.primary = true;
      buttons.push(button);
    }
  }
  // Campos sempre ocultos: só os simples (sem listas nem arquivos).
  function keepHidden(attrs: Record<string, string>) {
    const name = attrs.name;
    const info = meta[name];
    if (!info || fields[name] || hidden.has(name)) return;
    if (!SUPPORTED.has(info.type) || ["one2many", "binary"].includes(info.type))
      return;
    fields[name] = {
      ...fieldDef(info, attrs, "", undefined, undefined),
      hidden: true,
    };
  }
  walk(arch, "Geral", undefined, undefined);

  const relabel = (defs: Record<string, FieldDef>) => {
    for (const [name, label] of Object.entries(options.labels ?? {}))
      if (defs[name]) defs[name].label = label;
  };
  relabel(fields);
  for (const def of Object.values(fields)) if (def.sub) relabel(def.sub.fields);
  for (const name of options.locked ?? []) {
    if (fields[name]) {
      fields[name].readonly = true;
      delete fields[name].readonlyIf;
    }
  }
  const sections: FormSchema["sections"] = [];
  for (const { section, name } of order) {
    let target = sections.find((s) => s.title === section);
    if (!target) sections.push((target = { title: section, fields: [] }));
    target.fields.push(name);
  }
  const deps = dependencies(fields, meta);
  if (status && !fields[status.name] && !deps.includes(status.name))
    deps.push(status.name);
  for (const button of buttons)
    if (button.invisibleIf)
      for (const name of names(button.invisibleIf))
        if (!fields[name] && !deps.includes(name) && meta[name]) {
          if (meta[name].type === "one2many") continue;
          deps.push(name);
        }
  return {
    model,
    sections,
    fields,
    deps,
    ...(options.buttons ? { buttons } : {}),
    ...(status ? { status } : {}),
  };
}

function endDateField(attrs: Record<string, string>) {
  if (attrs.widget !== "daterange") return undefined;
  return /['"]end_date_field['"]\s*:\s*['"](\w+)['"]/.exec(
    attrs.options ?? "",
  )?.[1];
}

function stages(node: ArchNode, meta: Record<string, Meta>): ArchNode[] {
  if (node.tag !== "field")
    return node.children.flatMap((c) => stages(c, meta));
  const { name, widget, options } = node.attrs;
  const clickable = /['"]clickable['"]\s*:\s*(['"]?1['"]?|True)/;
  return /^statusbar/.test(widget ?? "") &&
    meta[name]?.type === "many2one" &&
    clickable.test(options ?? "")
    ? [node]
    : [];
}

function fieldDef(
  info: Meta,
  attrs: Record<string, string>,
  section: string,
  group: string | undefined,
  invisible: string | undefined,
): FieldDef {
  const flag = (value: string | undefined, fallback: boolean) => {
    if (value === undefined) return { fixed: fallback };
    if (ALWAYS.includes(value.trim())) return { fixed: true };
    if (NEVER.includes(value.trim())) return { fixed: false };
    return { fixed: false, expr: value };
  };
  const readonly = flag(attrs.readonly, !!info.readonly);
  const required = flag(attrs.required, !!info.required);
  const def: FieldDef = {
    name: info.name,
    label: attrs.string || info.string,
    type: info.type,
    required: required.fixed,
    readonly: readonly.fixed,
    section,
  };
  if (attrs.widget) def.widget = attrs.widget;
  if (required.expr) def.requiredIf = required.expr;
  if (readonly.expr) def.readonlyIf = readonly.expr;
  if (invisible) def.invisibleIf = invisible;
  if (group) def.group = group;
  if (attrs.placeholder) def.placeholder = attrs.placeholder;
  if (typeof info.help === "string" && info.help.trim()) def.help = info.help.trim().slice(0, 1200);
  if (info.selection) def.selection = info.selection;
  if (info.relation) def.relation = info.relation;
  const domain = attrs.domain ?? info.domain;
  if (domain && !(Array.isArray(domain) && !domain.length)) def.domain = domain;
  if (attrs.on_change === "1") def.onChange = true;
  return def;
}

function subSchema(
  info: Meta,
  view: ArchNode,
  models: Models,
  hidden: Set<string>,
): SubSchema {
  const relation = info.relation!;
  const meta = models[relation]?.fields ?? {};
  const fields: Record<string, FieldDef> = {};
  const columns: string[] = [];
  const walk = (node: ArchNode) => {
    const attrs = node.attrs;
    if (node.tag === "button" || node.tag === "header" || node.tag === "widget")
      return;
    if (node.tag === "field") {
      const sub = meta[attrs.name];
      if (!sub || !SUPPORTED.has(sub.type)) return;
      if (sub.type === "one2many" || sub.type === "binary") return;
      if (isStatic(attrs.invisible) || isStatic(attrs.column_invisible)) {
        if (sub.name === info.relation_field || fields[sub.name]) return;
        if (hidden.has(sub.name)) return;
        fields[sub.name] = {
          ...fieldDef(sub, attrs, "", undefined, undefined),
          hidden: true,
        };
        return;
      }
      if (attrs.widget && SKIPPED_WIDGETS.has(attrs.widget)) return;
      if (sub.name === info.relation_field) return;
      if (fields[sub.name] && !fields[sub.name].hidden) return;
      if (hidden.has(sub.name)) return;
      const invisible =
        attrs.invisible && !NEVER.includes(attrs.invisible.trim())
          ? attrs.invisible
          : undefined;
      fields[sub.name] = fieldDef(sub, attrs, "", undefined, invisible);
      // column_invisible depende só do registro principal (parent).
      const column = attrs.column_invisible?.trim();
      if (column && !NEVER.includes(column))
        fields[sub.name].columnInvisibleIf = column;
      columns.push(sub.name);
      return;
    }
    node.children.forEach(walk);
  };
  walk(view);
  return {
    model: relation,
    inverse: info.relation_field,
    columns,
    fields,
    deps: dependencies(fields, meta),
  };
}

function dependencies(
  fields: Record<string, FieldDef>,
  meta: Record<string, Meta>,
) {
  const found = new Set<string>();
  for (const def of Object.values(fields)) {
    for (const expr of [
      def.invisibleIf,
      def.readonlyIf,
      def.requiredIf,
      def.columnInvisibleIf,
    ])
      if (expr) names(expr).forEach((n) => found.add(n));
    if (typeof def.domain === "string")
      names(def.domain).forEach((n) => found.add(n));
  }
  return [...found].filter(
    (name) => !fields[name] && meta[name] && meta[name].type !== "one2many",
  );
}

// ---- conversão de valores -------------------------------------------------

type Spec = Record<string, { fields?: Spec }>;
function specOf(
  fields: Record<string, FieldDef>,
  deps: string[],
  depTypes: Record<string, Meta>,
): Spec {
  const spec: Spec = {};
  const add = (name: string, type: string, sub?: SubSchema) => {
    if (type === "many2one" || type === "many2many")
      spec[name] = { fields: { display_name: {} } };
    else if (type === "one2many" && sub)
      spec[name] = { fields: specOf(sub.fields, sub.deps, {}) };
    else spec[name] = {};
  };
  for (const def of Object.values(fields)) add(def.name, def.type, def.sub);
  for (const name of deps) add(name, depTypes[name]?.type ?? "char");
  return spec;
}

const ref = (value: unknown): Ref | null =>
  value && typeof value === "object" && "id" in value
    ? {
        id: (value as { id: number }).id,
        name: String((value as { display_name?: string }).display_name ?? ""),
      }
    : null;

export function fromOdoo(
  record: Values,
  fields: Record<string, FieldDef>,
  depTypes: Record<string, string> = {},
): Values {
  const out: Values = { id: record.id };
  for (const [name, raw] of Object.entries(record)) {
    if (name === "id") continue;
    const def = fields[name];
    const type = def?.type ?? depTypes[name];
    out[name] = convertIn(raw, type, def);
  }
  return out;
}
function convertIn(
  raw: unknown,
  type: string | undefined,
  def?: FieldDef,
): unknown {
  switch (type) {
    case "many2one":
      return ref(raw);
    case "many2many":
      return Array.isArray(raw) ? raw.map(ref).filter(Boolean) : [];
    case "one2many":
      return Array.isArray(raw) && def?.sub
        ? raw.map((row) => fromOdoo(row as Values, def.sub!.fields))
        : [];
    case "html":
      return htmlToText(raw);
    case "boolean":
      return !!raw;
    case "integer":
    case "float":
    case "monetary":
      return typeof raw === "number" ? raw : null;
    default:
      return raw === false || raw === undefined ? null : raw;
  }
}

function idOf(value: unknown): number | null {
  if (value === null || value === undefined || value === false || value === "")
    return null;
  if (typeof value === "number" && Number.isInteger(value) && value > 0)
    return value;
  if (typeof value === "object" && value && "id" in value)
    return idOf((value as { id: unknown }).id);
  throw new Error("referência inválida");
}
function idsOf(value: unknown): number[] {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) throw new Error("lista esperada");
  return value.map((item) => {
    const id = idOf(item);
    if (id === null) throw new Error("referência inválida");
    return id;
  });
}

// Converte um valor vindo da tela ERA para o formato de gravação do Odoo.
function convertOut(value: unknown, def: FieldDef): unknown {
  const fail = (why: string): never => {
    throw new BadRequestException(def.label + ": " + why);
  };
  const empty = value === null || value === undefined || value === "";
  switch (def.type) {
    case "char":
    case "text":
      if (empty) return false;
      if (typeof value !== "string") fail("texto esperado");
      if ((value as string).length > 10000) fail("texto muito longo");
      return value;
    case "html":
      if (empty) return false;
      if (typeof value !== "string") fail("texto esperado");
      return textToHtml(value as string);
    case "selection":
      if (empty) return false;
      if (!def.selection?.some(([key]) => key === value))
        fail("opção inválida");
      return value;
    case "boolean":
      if (typeof value !== "boolean") fail("sim/não esperado");
      return value;
    case "integer":
      if (empty) return 0;
      if (!Number.isInteger(value)) fail("número inteiro esperado");
      return value;
    case "float":
    case "monetary":
      if (empty) return 0;
      if (typeof value !== "number" || !Number.isFinite(value))
        fail("número esperado");
      return value;
    case "date":
      if (empty) return false;
      if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
        fail("data inválida");
      return value;
    case "datetime":
      if (empty) return false;
      if (
        typeof value !== "string" ||
        !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(value)
      )
        fail("data e hora inválidas");
      return value;
    case "binary":
      if (empty) return false;
      if (
        typeof value !== "string" ||
        !/^[A-Za-z0-9+/]+=*$/.test(value) ||
        value.length > (IMAGE_LIMIT * 4) / 3
      )
        fail("imagem inválida ou acima de 3 MB");
      return value;
    case "many2one":
      try {
        return idOf(value) ?? false;
      } catch {
        return fail("referência inválida");
      }
    case "many2many":
      try {
        return [[6, 0, idsOf(value)]];
      } catch {
        return fail("lista inválida");
      }
  }
  return fail("tipo não suportado");
}

// Escopo usado pelas expressões do Odoo (invisible, readonly, domain).
function scopeOf(values: Values, parent?: Values) {
  return parent ? { ...values, parent } : values;
}
// Condição de somente leitura só vale quando os campos que ela usa estão no
// registro; num item novo, sem esses campos, prevalece o que a tela enviou.
export function isReadonly(def: FieldDef, scope: Values) {
  if (def.readonly) return true;
  if (!def.readonlyIf) return false;
  if (!names(def.readonlyIf).every((name) => name in scope)) return false;
  return check(def.readonlyIf, scope);
}

type References = Map<string, Set<number>>;
function collect(refs: References, relation: string, ids: number[]) {
  if (!ids.length) return;
  const set = refs.get(relation) ?? new Set<number>();
  ids.forEach((id) => set.add(id));
  refs.set(relation, set);
}

// Monta os valores de gravação: ignora campos somente leitura (como o próprio
// Odoo faz) e recusa campos que não estão no formulário.
export function toOdooValues(
  fields: Record<string, FieldDef>,
  input: Values,
  current: Values,
  refs: References,
  parent?: Values,
): Values {
  const merged = { ...current, ...input };
  const scope = scopeOf(merged, parent);
  const out: Values = {};
  for (const [name, value] of Object.entries(input)) {
    if (name === "id") continue;
    const def = fields[name];
    if (!def) throw new BadRequestException("Campo não permitido: " + name);
    if (isReadonly(def, scope)) continue;
    if (!parent && missing(def, value, scope))
      throw new BadRequestException("Preencha o campo " + def.label);
    if (def.type === "one2many") {
      out[name] = rowsToCommands(def, value, current[name], refs, merged);
      continue;
    }
    const converted = convertOut(value, def);
    if (def.relation && def.type === "many2one" && converted)
      collect(refs, def.relation, [converted as number]);
    if (def.relation && def.type === "many2many")
      collect(
        refs,
        def.relation,
        (converted as [number, number, number[]][])[0][2],
      );
    out[name] = converted;
  }
  return out;
}

// Campo obrigatório na tela do Odoo enviado vazio: o Odoo web não deixa
// salvar, e o Odoo nem sempre impõe isso no banco (ex.: categoria da despesa).
function missing(def: FieldDef, value: unknown, scope: Values) {
  if (def.hidden || def.type === "boolean" || def.type === "one2many")
    return false;
  const known = (expr?: string) =>
    !!expr && names(expr).every((name) => name in scope);
  const required =
    def.required || (known(def.requiredIf) && check(def.requiredIf!, scope));
  if (!required) return false;
  if (known(def.invisibleIf) && check(def.invisibleIf!, scope)) return false;
  if (def.invisibleIf && !known(def.invisibleIf)) return false;
  return (
    value === null ||
    value === undefined ||
    value === false ||
    (typeof value === "string" && !value.trim()) ||
    (Array.isArray(value) && !value.length)
  );
}

function rowsToCommands(
  def: FieldDef,
  value: unknown,
  current: unknown,
  refs: References,
  parent: Values,
) {
  if (!Array.isArray(value))
    throw new BadRequestException(def.label + ": lista esperada");
  if (value.length > 500)
    throw new BadRequestException(def.label + ": itens demais");
  const sub = def.sub!;
  const existing = new Map<number, Values>();
  for (const row of Array.isArray(current) ? (current as Values[]) : [])
    existing.set(row.id as number, row);
  const commands: unknown[] = [];
  const kept = new Set<number>();
  for (const raw of value) {
    if (!raw || typeof raw !== "object")
      throw new BadRequestException(def.label + ": item inválido");
    const row = raw as Values;
    const id = typeof row.id === "number" ? row.id : null;
    if (id !== null) {
      const before = existing.get(id);
      if (!before)
        throw new BadRequestException(
          def.label + ": item não pertence ao registro",
        );
      kept.add(id);
      const changed = Object.fromEntries(
        Object.entries(row).filter(
          ([key, v]) =>
            key !== "id" && JSON.stringify(v) !== JSON.stringify(before[key]),
        ),
      );
      const values = toOdooValues(sub.fields, changed, before, refs, parent);
      if (Object.keys(values).length) commands.push([1, id, values]);
    } else {
      const { id: _ignored, ...rest } = row;
      commands.push([0, 0, toOdooValues(sub.fields, rest, {}, refs, parent)]);
    }
  }
  for (const id of existing.keys()) if (!kept.has(id)) commands.push([2, id]);
  return commands;
}

// Valores ERA → formato que o onchange do Odoo espera.
function onchangeValues(
  fields: Record<string, FieldDef>,
  values: Values,
  deps: string[] = [],
): Values {
  const out: Values = {};
  for (const [name, value] of Object.entries(values)) {
    const def = fields[name];
    if (!def) {
      if (deps.includes(name))
        out[name] =
          value && typeof value === "object" && "id" in value
            ? (value as Ref).id
            : Array.isArray(value)
              ? [[6, 0, value.map((v) => idOf(v))]]
              : (value ?? false);
      continue;
    }
    try {
      if (def.type === "one2many") {
        out[name] = Array.isArray(value)
          ? (value as Values[]).map((row, index) => {
              const vals = onchangeValues(def.sub!.fields, row, def.sub!.deps);
              delete vals.id;
              return typeof row.id === "number"
                ? [1, row.id, vals]
                : [0, "virtual_" + index, vals];
            })
          : [];
      } else if (def.type === "binary") continue;
      else out[name] = convertOut(value, def);
    } catch {
      out[name] = false;
    }
  }
  return out;
}

function applyX2many(current: unknown, commands: unknown): Ref[] {
  let list: Ref[] = Array.isArray(current) ? [...(current as Ref[])] : [];
  if (!Array.isArray(commands)) return list;
  for (const command of commands as unknown[][]) {
    const [code, id, data] = command as [
      number,
      number,
      Record<string, unknown>,
    ];
    if (code === 5) list = [];
    else if (code === 4 || code === 1 || code === 0) {
      const name = String(data?.display_name ?? "");
      const at = list.findIndex((item) => item.id === id);
      if (at >= 0) list[at] = { id, name: name || list[at].name };
      else if (typeof id === "number") list.push({ id, name });
    } else if (code === 3 || code === 2)
      list = list.filter((item) => item.id !== id);
    else if (code === 6)
      list = ((command[2] as number[]) ?? []).map((v) => ({ id: v, name: "" }));
  }
  return list;
}

function changesFromOdoo(
  value: Values,
  fields: Record<string, FieldDef>,
  current: Values,
  deps: string[] = [],
): Values {
  const out: Values = {};
  for (const [name, raw] of Object.entries(value)) {
    const def = fields[name];
    if (!def) {
      // Campos auxiliares das condições da tela (ex.: product_updatable).
      if (deps.includes(name))
        out[name] =
          raw && typeof raw === "object" && "id" in raw ? ref(raw) : raw;
      continue;
    }
    if (def.type === "one2many") continue;
    out[name] =
      def.type === "many2many"
        ? applyX2many(current[name], raw)
        : convertIn(raw, def.type, def);
  }
  return out;
}

// ---- serviço -------------------------------------------------------------

@Injectable()
export class OdooForms {
  private schemas = new Map<
    string,
    { at: number; schema: Promise<FormSchema> }
  >();
  private companyFields = new Map<string, Promise<boolean>>();
  private lang: Promise<string | null> | null = null;
  constructor(@Inject(OdooClient) private odoo: OdooClient) {}

  // Depois de instalar ou remover aplicativos as telas do Odoo mudam.
  forget() {
    this.schemas.clear();
    this.companyFields.clear();
  }

  schema(companyId: number, model: string, options: FormOptions = {}) {
    const key = model + JSON.stringify(options);
    const cached = this.schemas.get(key);
    if (cached && Date.now() - cached.at < 10 * 60 * 1000) return cached.schema;
    const schema = this.loadSchema(companyId, model, options);
    this.schemas.set(key, { at: Date.now(), schema });
    schema.catch(() => this.schemas.delete(key));
    return schema;
  }

  private async loadSchema(
    companyId: number,
    model: string,
    options: FormOptions,
  ) {
    const views = await this.call<{
      views: { form: { arch: string } };
      models: Models;
    }>(companyId, model, "get_views", [[[options.viewId ?? false, "form"]]], {});
    const arch = parseArch(views.views.form.arch);
    // Listas de itens sem tela embutida usam a lista padrão do modelo filho.
    const extra: Record<string, ArchNode> = {};
    const models = { ...views.models };
    const missing = new Set<string>();
    const find = (node: ArchNode) => {
      if (node.tag === "field") {
        const info = models[model]?.fields[node.attrs.name];
        if (
          info?.type === "one2many" &&
          !node.children.some((c) => ["list", "tree", "form"].includes(c.tag))
        )
          missing.add(info.relation!);
        return;
      }
      node.children.forEach(find);
    };
    find(arch);
    for (const relation of missing) {
      try {
        const sub = await this.call<{
          views: { list: { arch: string } };
          models: Models;
        }>(companyId, relation, "get_views", [[[false, "list"]]], {});
        extra[relation] = parseArch(sub.views.list.arch);
        // Mescla campo a campo: a lista do filho também descreve modelos já
        // conhecidos (inclusive o principal) com menos campos.
        for (const [name, entry] of Object.entries(sub.models))
          models[name] = {
            fields: { ...entry.fields, ...models[name]?.fields },
          };
      } catch {
        // sem acesso ao modelo filho: o campo fica fora do formulário
      }
    }
    const schema = buildSchema(model, arch, models, options, extra);
    (schema as FormSchema & { depTypes?: Record<string, Meta> }).depTypes =
      Object.fromEntries(
        schema.deps.map((name) => [name, models[model].fields[name]]),
      );
    return schema;
  }

  private depTypes(schema: FormSchema) {
    return (
      (schema as FormSchema & { depTypes?: Record<string, Meta> }).depTypes ??
      {}
    );
  }

  async read(companyId: number, schema: FormSchema, domain: Domain) {
    const depTypes = this.depTypes(schema);
    const result = await this.call<{ records: Values[] }>(
      companyId,
      schema.model,
      "web_search_read",
      [],
      {
        domain,
        specification: specOf(schema.fields, schema.deps, depTypes),
        limit: 1,
        context: { active_test: false, bin_size: false },
      },
    );
    const record = result.records[0];
    if (!record) return null;
    return fromOdoo(
      record,
      schema.fields,
      Object.fromEntries(Object.entries(depTypes).map(([k, v]) => [k, v.type])),
    );
  }

  async defaults(companyId: number, schema: FormSchema, context: Values = {}) {
    const depTypes = this.depTypes(schema);
    const result = await this.call<{ value: Values }>(
      companyId,
      schema.model,
      "onchange",
      [[], {}, [], specOf(schema.fields, schema.deps, depTypes)],
      { context },
    );
    const values = fromOdoo(
      result.value,
      schema.fields,
      Object.fromEntries(Object.entries(depTypes).map(([k, v]) => [k, v.type])),
    );
    delete values.id;
    for (const def of Object.values(schema.fields))
      if (def.type === "one2many" && values[def.name] === undefined)
        values[def.name] = [];
    return values;
  }

  // Valida e converte para gravação; confere se as referências escolhidas
  // pertencem à empresa (ou são compartilhadas).
  async values(
    companyId: number,
    schema: FormSchema,
    input: unknown,
    current: Values,
  ) {
    if (!input || typeof input !== "object" || Array.isArray(input))
      throw new BadRequestException("Dados inválidos");
    const refs: References = new Map();
    const values = toOdooValues(schema.fields, input as Values, current, refs);
    for (const [relation, ids] of refs) {
      if (!(await this.hasCompany(companyId, relation))) continue;
      const list = [...ids];
      const found = await this.call<number>(
        companyId,
        relation,
        "search_count",
        [
          [
            ["id", "in", list],
            "|",
            ["company_id", "=", false],
            ["company_id", "in", [companyId]],
          ],
        ],
        { context: { active_test: false } },
      );
      if (found !== list.length)
        throw new NotFoundException("Registro relacionado não encontrado");
    }
    return values;
  }

  async onchange(
    companyId: number,
    schema: FormSchema,
    raw: unknown,
    recordId?: number,
    context: Values = {},
  ) {
    const body = (raw ?? {}) as {
      values?: Values;
      field?: string;
      line?: { index?: number; values?: Values; field?: string };
    };
    const values = body.values ?? {};
    const field = String(body.field ?? "");
    const def = schema.fields[field];
    if (!def) throw new BadRequestException("Campo não permitido: " + field);
    const depTypes = this.depTypes(schema);
    if (def.type === "one2many" && body.line) {
      const sub = def.sub!;
      const lineField = String(body.line.field ?? "");
      // Campo vazio: valores padrão de um item novo.
      if (lineField && !sub.fields[lineField])
        throw new BadRequestException("Campo não permitido: " + lineField);
      const parentFields = { ...schema.fields };
      delete parentFields[field];
      const parentValues = onchangeValues(parentFields, values, schema.deps);
      if (recordId) parentValues.id = recordId;
      const lineValues = onchangeValues(
        sub.fields,
        body.line.values ?? {},
        sub.deps,
      );
      const lineId = (body.line.values ?? {}).id;
      delete lineValues.id;
      if (sub.inverse) lineValues[sub.inverse] = parentValues;
      const spec = specOf(sub.fields, sub.deps, {});
      if (sub.inverse) {
        const parentSpec = specOf(parentFields, schema.deps, depTypes);
        for (const key of Object.keys(parentSpec))
          if (schema.fields[key]?.type === "one2many") delete parentSpec[key];
        spec[sub.inverse] = { fields: parentSpec };
      }
      const result = await this.call<{ value: Values }>(
        companyId,
        sub.model,
        "onchange",
        [
          typeof lineId === "number" ? [lineId] : [],
          lineValues,
          lineField ? [lineField] : [],
          spec,
        ],
        { context },
      );
      return {
        line: changesFromOdoo(
          result.value ?? {},
          sub.fields,
          body.line.values ?? {},
          sub.deps,
        ),
      };
    }
    const odooValues = onchangeValues(schema.fields, values, schema.deps);
    const result = await this.call<{ value: Values }>(
      companyId,
      schema.model,
      "onchange",
      [
        recordId ? [recordId] : [],
        odooValues,
        [field],
        specOf(schema.fields, schema.deps, depTypes),
      ],
      { context },
    );
    return {
      values: changesFromOdoo(
        result.value ?? {},
        schema.fields,
        values,
        schema.deps,
      ),
    };
  }

  async lookup(
    companyId: number,
    schema: FormSchema,
    raw: unknown,
    context: Values = {},
  ) {
    const body = (raw ?? {}) as {
      field?: string;
      q?: string;
      values?: Values;
      line?: { field?: string; values?: Values };
    };
    let def = schema.fields[String(body.field ?? "")];
    let scope: Values = body.values ?? {};
    if (def?.type === "one2many" && body.line) {
      const parent = scope;
      scope = scopeOf(body.line.values ?? {}, parent);
      def = def.sub!.fields[String(body.line.field ?? "")];
    }
    if (!def || !def.relation || !["many2one", "many2many"].includes(def.type))
      throw new BadRequestException("Campo sem lista de opções");
    const q = String(body.q ?? "").slice(0, 100);
    let domain: unknown[] = [];
    try {
      const evaluated =
        typeof def.domain === "string"
          ? evaluate(def.domain, scope)
          : def.domain;
      if (Array.isArray(evaluated)) domain = evaluated;
    } catch {
      domain = [];
    }
    if (await this.hasCompany(companyId, def.relation))
      domain = [
        ...domain,
        "|",
        ["company_id", "=", false],
        ["company_id", "in", [companyId]],
      ];
    const found = await this.call<Array<[number, string]>>(
      companyId,
      def.relation,
      "name_search",
      [q, domain, "ilike", 30],
      { context },
    );
    return found.map(([id, name]) => ({ id, name }));
  }

  private hasCompany(companyId: number, relation: string) {
    let cached = this.companyFields.get(relation);
    if (!cached) {
      cached = this.call<Record<string, unknown>>(
        companyId,
        relation,
        "fields_get",
        [["company_id"]],
        { attributes: ["type"] },
      ).then((found) => "company_id" in found);
      cached.catch(() => this.companyFields.delete(relation));
      this.companyFields.set(relation, cached);
    }
    return cached;
  }

  // Usa o idioma português quando instalado no Odoo; senão, o padrão do Odoo.
  private language(companyId: number) {
    this.lang ??= this.odoo
      .execute<number>(companyId, "res.lang", "search_count", [
        [["code", "=", "pt_BR"]],
      ])
      .then((found) => (found ? "pt_BR" : null));
    this.lang.catch(() => (this.lang = null));
    return this.lang;
  }

  async call<T>(
    companyId: number,
    model: string,
    method: string,
    args: unknown[],
    kwargs: Record<string, unknown>,
    timeoutMs?: number,
  ): Promise<T> {
    const lang = await this.language(companyId);
    const context = (kwargs.context as Values | undefined) ?? {};
    return this.odoo.execute<T>(
      companyId,
      model,
      method,
      args,
      { ...kwargs, context: lang ? { lang, ...context } : context },
      timeoutMs,
    );
  }
}
