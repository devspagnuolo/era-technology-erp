"use client";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Download,
  LayoutGrid,
  Plus,
  Printer,
  Puzzle,
  Search,
  Settings2,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { api, apiFile } from "../lib/session";
import { Button } from "./ui/button";
import {
  type ButtonDef,
  type FormSchema,
  OdooFormView,
  type Values,
  toPayload,
  useOdooForm,
} from "./odoo-form";
import { OdooUnavailable, useOdooStatus } from "./odoo-status";
import { check } from "../../../../packages/shared/odoo-expr";

// Todos os aplicativos do Odoo dentro da ERA: menus, listas, formulários,
// botões, assistentes, relatórios, mensagens, loja de aplicativos e
// configurações. O Odoo é o motor; o usuário nunca precisa abri-lo.
export type Menu = {
  id: number;
  name: string;
  xmlid: string;
  action: number | null;
  icon?: string;
  children: Menu[];
};
export type RunTarget = {
  app?: string; // xmlid do menu raiz do aplicativo
  screen?: "launcher" | "store" | "settings";
};
type WindowAction = {
  kind: "window";
  id: number | null;
  title: string;
  model: string;
  resId: number | null;
  target: string;
  views: { list?: number; form?: number; search?: number };
  modes: string[];
  context: Values;
  domain: unknown[] | null;
  help: string | null;
};
type RunAction =
  | WindowAction
  | { kind: "reload" }
  | { kind: "message"; title: string; message: string }
  | { kind: "report"; report: string; ids: number[]; title: string };
type ListPage = {
  title: string;
  model: string;
  columns: Array<{
    name: string;
    label: string;
    type: string;
    widget?: string;
  }>;
  filters: Array<{ name: string; label: string; group: number }>;
  selected: string[];
  rows: Array<{
    id: number;
    name: string;
    values: Values;
    currency?: string;
  }>;
  total: number;
  page: number;
  pageSize: number;
  help: string | null;
  canCreate: boolean;
  canDelete: boolean;
  formView: number | null;
  context: Values;
};
type RecordForm = {
  schema: FormSchema;
  values: Values;
  title: string;
  model: {
    name: string;
    transient: boolean;
    chatter: boolean;
    archivable: boolean;
    reports: Array<{ name: string; report: string }>;
  };
};
// Lista aberta: uma ação de menu ou o resultado de um botão.
type Screen = {
  title: string;
  action?: number;
  model?: string;
  domain?: unknown[] | null;
  context?: Values;
  formView?: number;
};
type Opened =
  | {
      kind: "record";
      model: string;
      id?: number;
      view?: number;
      context?: Values;
    }
  | {
      kind: "wizard";
      model: string;
      view?: number;
      context: Values;
      title: string;
    };

// Tela e contexto do formulário viajam no caminho das rotas da API.
function formKey(view?: number, context?: Values) {
  if (!view && (!context || !Object.keys(context).length)) return "_";
  const json = JSON.stringify({ view, context });
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
const endpointOf = (model: string, view?: number, context?: Values) =>
  "odoo/run/m/" + model + "/" + formKey(view, context);

export async function openReport(report: string, ids: number[]) {
  const blob = await apiFile(
    "odoo/run/report/" + report + "?ids=" + ids.join(","),
  );
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function cell(value: unknown, type: string, currency?: string) {
  if (value === null || value === undefined || value === "") return "—";
  if (type === "boolean") return value ? "Sim" : "Não";
  if (type === "date" && typeof value === "string")
    return value.slice(0, 10).split("-").reverse().join("/");
  if (type === "datetime" && typeof value === "string") {
    const date = new Date(value.replace(" ", "T") + "Z");
    return isNaN(date.getTime()) ? value : date.toLocaleString("pt-BR");
  }
  if (type === "monetary" && typeof value === "number")
    try {
      return value.toLocaleString("pt-BR", {
        style: "currency",
        currency: currency || "BRL",
      });
    } catch {
      return value.toFixed(2);
    }
  if (type === "float" && typeof value === "number")
    return value.toLocaleString("pt-BR", { maximumFractionDigits: 4 });
  return String(value);
}

export function OdooRun({
  permissions,
  target,
  onTarget,
}: {
  permissions: string[];
  target: RunTarget;
  onTarget: (target: RunTarget) => void;
}) {
  const { status: integration, ready } = useOdooStatus();
  const menus = useQuery({
    queryKey: ["odoo-run", "menus"],
    queryFn: () => api<Menu[]>("odoo/run/menus"),
    enabled: ready,
    staleTime: 60000,
  });
  if (!ready)
    return (
      <>
        <div className="page-heading">
          <div>
            <p className="eyebrow">APLICATIVOS · ODOO</p>
            <h1>Aplicativos</h1>
          </div>
        </div>
        <OdooUnavailable status={integration} icon={<LayoutGrid size={18} />} />
      </>
    );
  if (target.screen === "store")
    return <AppStore permissions={permissions} onBack={() => onTarget({})} />;
  if (target.screen === "settings")
    return <Settings permissions={permissions} onBack={() => onTarget({})} />;
  const app = target.app
    ? menus.data?.find((m) => m.xmlid === target.app)
    : undefined;
  if (target.app && app)
    return (
      <AppView
        key={app.xmlid}
        app={app}
        permissions={permissions}
        onBack={() => onTarget({})}
      />
    );
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">APLICATIVOS · DADOS DO ODOO</p>
          <h1>Todos os aplicativos</h1>
          <p>
            Cada aplicativo instalado no Odoo funciona aqui, com os mesmos
            menus, cadastros, botões e relatórios.
          </p>
        </div>
      </div>
      {menus.error ? (
        <div className="empty" role="alert">
          <p>{menus.error.message}</p>
          <Button variant="outline" onClick={() => menus.refetch()}>
            Tentar novamente
          </Button>
        </div>
      ) : !menus.data ? (
        <div className="empty">Buscando aplicativos no Odoo…</div>
      ) : (
        <div className="run-launcher">
          {menus.data
            .filter(
              (m) =>
                !["base.menu_management", "base.menu_administration"].includes(
                  m.xmlid,
                ),
            )
            .map((menu) => (
              <button
                type="button"
                key={menu.id}
                className="run-app-card"
                onClick={() => onTarget({ app: menu.xmlid })}
              >
                {menu.icon ? (
                  <img src={menu.icon} alt="" />
                ) : (
                  <span className="run-app-fallback">
                    <LayoutGrid size={22} />
                  </span>
                )}
                <span>{menu.name}</span>
              </button>
            ))}
          <button
            type="button"
            className="run-app-card"
            onClick={() => onTarget({ screen: "store" })}
          >
            <span className="run-app-fallback">
              <Puzzle size={22} />
            </span>
            <span>Loja de aplicativos</span>
          </button>
          {permissions.includes("odoo:admin") && (
            <button
              type="button"
              className="run-app-card"
              onClick={() => onTarget({ screen: "settings" })}
            >
              <span className="run-app-fallback">
                <Settings2 size={22} />
              </span>
              <span>Configurações</span>
            </button>
          )}
        </div>
      )}
    </>
  );
}

// ---- aplicativo: menus do Odoo + tela da ação escolhida -------------------

function firstAction(menu: Menu): Menu | null {
  if (menu.action) return menu;
  for (const child of menu.children) {
    const found = firstAction(child);
    if (found) return found;
  }
  return null;
}

function AppView({
  app,
  permissions,
  onBack,
}: {
  app: Menu;
  permissions: string[];
  onBack: () => void;
}) {
  const start = firstAction(app);
  const [menu, setMenu] = useState<Menu | null>(start);
  const [section, setSection] = useState<number | null>(
    app.children.find((c) => c === start || firstAction(c) === start)?.id ??
      null,
  );
  const [stack, setStack] = useState<Screen[]>([]);
  const open = (item: Menu) => {
    setMenu(item);
    setStack([]);
  };
  const current = app.children.find((c) => c.id === section);
  return (
    <>
      <div className="run-appbar">
        <Button variant="outline" size="sm" onClick={onBack}>
          <LayoutGrid size={15} /> Aplicativos
        </Button>
        {app.icon && <img src={app.icon} alt="" />}
        <strong>{app.name}</strong>
        <nav className="run-menubar" aria-label={"Menus de " + app.name}>
          {app.children.map((child) => (
            <button
              type="button"
              key={child.id}
              className={child.id === section ? "active" : ""}
              onClick={() => {
                setSection(child.id);
                if (child.action) open(child);
                else if (!child.children.length) return;
                else {
                  const first = firstAction(child);
                  if (first) open(first);
                }
              }}
            >
              {child.name}
            </button>
          ))}
        </nav>
      </div>
      {current && current.children.length > 0 && (
        <nav className="run-submenu" aria-label={current.name}>
          {current.children.flatMap((child) =>
            child.children.length
              ? [
                  <span key={"g" + child.id} className="run-submenu-group">
                    {child.name}
                  </span>,
                  ...child.children
                    .filter((c) => c.action)
                    .map((leaf) => (
                      <button
                        type="button"
                        key={leaf.id}
                        className={leaf.id === menu?.id ? "active" : ""}
                        onClick={() => open(leaf)}
                      >
                        {leaf.name}
                      </button>
                    )),
                ]
              : child.action
                ? [
                    <button
                      type="button"
                      key={child.id}
                      className={child.id === menu?.id ? "active" : ""}
                      onClick={() => open(child)}
                    >
                      {child.name}
                    </button>,
                  ]
                : [],
          )}
        </nav>
      )}
      {stack.length > 0 ? (
        <ActionScreen
          key={"s" + stack.length}
          screen={stack[stack.length - 1]}
          permissions={permissions}
          onPush={(screen) => setStack((s) => [...s, screen])}
          onBack={() => setStack((s) => s.slice(0, -1))}
        />
      ) : menu?.action ? (
        <MenuAction
          key={menu.id}
          menu={menu}
          permissions={permissions}
          onPush={(screen) => setStack((s) => [...s, screen])}
        />
      ) : (
        <div className="empty">
          <h3>Escolha um menu</h3>
        </div>
      )}
    </>
  );
}

// Ação do menu: lista, formulário único ou aviso (painéis próprios do Odoo).
function MenuAction({
  menu,
  permissions,
  onPush,
}: {
  menu: Menu;
  permissions: string[];
  onPush: (screen: Screen) => void;
}) {
  const action = useQuery({
    queryKey: ["odoo-run", "action", menu.action],
    queryFn: () => api<RunAction>("odoo/run/action/" + menu.action),
  });
  if (action.error)
    return (
      <div className="empty" role="alert">
        <p>{action.error.message}</p>
      </div>
    );
  if (!action.data) return <div className="empty">Abrindo {menu.name}…</div>;
  const data = action.data;
  if (data.kind === "message")
    return (
      <div className="empty">
        <h3>{data.title}</h3>
        <p>{data.message}</p>
      </div>
    );
  if (data.kind !== "window")
    return <div className="empty">Nada para exibir neste menu.</div>;
  if (data.target === "new" || (data.resId && !data.modes.includes("list")))
    return (
      <SingleRecord action={data} permissions={permissions} title={menu.name} />
    );
  return (
    <ActionScreen
      screen={{
        title: data.title || menu.name,
        action: data.id ?? undefined,
        model: data.id ? undefined : data.model,
        domain: data.id ? undefined : data.domain,
        context: data.id ? undefined : data.context,
        formView: data.views.form,
      }}
      permissions={permissions}
      onPush={onPush}
    />
  );
}

// Menu que abre direto um formulário (ex.: assistente ou registro único).
function SingleRecord({
  action,
  permissions,
  title,
}: {
  action: WindowAction;
  permissions: string[];
  title: string;
}) {
  const [opened, setOpened] = useState(true);
  if (!opened)
    return (
      <div className="empty">
        <h3>{title}</h3>
        <Button onClick={() => setOpened(true)}>Abrir</Button>
      </div>
    );
  return action.target === "new" ? (
    <WizardDialog
      model={action.model}
      view={action.views.form}
      context={action.context}
      title={action.title || title}
      permissions={permissions}
      onClose={() => setOpened(false)}
      onDone={() => setOpened(false)}
    />
  ) : (
    <RecordDialog
      model={action.model}
      id={action.resId ?? undefined}
      view={action.views.form}
      context={action.context}
      permissions={permissions}
      onClose={() => setOpened(false)}
    />
  );
}

// ---- lista ---------------------------------------------------------------

function ActionScreen({
  screen,
  permissions,
  onPush,
  onBack,
}: {
  screen: Screen;
  permissions: string[];
  onPush: (screen: Screen) => void;
  onBack?: () => void;
}) {
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<string[] | null>(null);
  const [page, setPage] = useState(1);
  const [opened, setOpened] = useState<Opened | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const params = new URLSearchParams({ q, page: String(page) });
  if (screen.action) params.set("action", String(screen.action));
  if (screen.model) params.set("model", screen.model);
  if (screen.domain) params.set("domain", JSON.stringify(screen.domain));
  if (screen.context) params.set("context", JSON.stringify(screen.context));
  if (filters) params.set("filters", filters.join(","));
  const list = useQuery({
    queryKey: ["odoo-run", "list", params.toString()],
    queryFn: () => api<ListPage>("odoo/run/list?" + params.toString()),
  });
  const data = list.data;
  const selected = filters ?? data?.selected ?? [];
  const canWrite = permissions.includes("odoo:write");
  const handle = useActionHandler(setOpened, onPush, setNotice, () =>
    list.refetch(),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">DADOS DO ODOO</p>
          <h1>
            {onBack && (
              <button
                type="button"
                className="run-back"
                aria-label="Voltar"
                onClick={onBack}
              >
                <ArrowLeft size={20} />
              </button>
            )}
            {data?.title ?? screen.title}
          </h1>
        </div>
        {data?.canCreate && canWrite && (
          <Button
            onClick={() =>
              setOpened({
                kind: "record",
                model: data.model,
                view: screen.formView ?? data.formView ?? undefined,
                context: data.context,
              })
            }
          >
            <Plus size={17} /> Novo
          </Button>
        )}
      </div>
      {notice && (
        <p className="run-notice" role="status">
          {notice}
          <button
            type="button"
            aria-label="Fechar aviso"
            onClick={() => setNotice(null)}
          >
            <X size={14} />
          </button>
        </p>
      )}
      <section className="table-card">
        <div className="table-toolbar">
          <div className="run-chips" role="group" aria-label="Filtros">
            {data?.filters.map((f) => {
              const on = selected.includes(f.name);
              return (
                <button
                  type="button"
                  key={f.name}
                  className={on ? "active" : ""}
                  aria-pressed={on}
                  onClick={() => {
                    setFilters(
                      on
                        ? selected.filter((n) => n !== f.name)
                        : [...selected, f.name],
                    );
                    setPage(1);
                  }}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
          <label className="search">
            <Search size={17} />
            <input
              aria-label="Buscar"
              placeholder="Buscar…"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />
          </label>
        </div>
        {list.error ? (
          <div className="empty" role="alert">
            <h3>Não foi possível carregar os dados</h3>
            <p>{list.error.message}</p>
            <Button variant="outline" onClick={() => list.refetch()}>
              Tentar novamente
            </Button>
          </div>
        ) : !data ? (
          <div className="empty">Buscando no Odoo…</div>
        ) : data.rows.length ? (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    {data.columns.map((c) => (
                      <th
                        key={c.name}
                        className={
                          ["integer", "float", "monetary"].includes(c.type)
                            ? "numeric"
                            : undefined
                        }
                      >
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row) => (
                    <tr
                      key={row.id}
                      className="run-row"
                      tabIndex={0}
                      onClick={() =>
                        setOpened({
                          kind: "record",
                          model: data.model,
                          id: row.id,
                          view: screen.formView ?? data.formView ?? undefined,
                          context: data.context,
                        })
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter")
                          setOpened({
                            kind: "record",
                            model: data.model,
                            id: row.id,
                            view: screen.formView ?? data.formView ?? undefined,
                            context: data.context,
                          });
                      }}
                    >
                      {data.columns.map((c) => (
                        <td
                          key={c.name}
                          className={
                            ["integer", "float", "monetary"].includes(c.type)
                              ? "numeric"
                              : undefined
                          }
                        >
                          {cell(row.values[c.name], c.type, row.currency)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <footer className="table-footer">
              <span>{data.total} registros</span>
              <div>
                <Button
                  variant="outline"
                  size="sm"
                  aria-label="Página anterior"
                  disabled={page === 1}
                  onClick={() => setPage(page - 1)}
                >
                  <ChevronLeft size={16} />
                </Button>
                <span>Página {page}</span>
                <Button
                  variant="outline"
                  size="sm"
                  aria-label="Próxima página"
                  disabled={page * data.pageSize >= data.total}
                  onClick={() => setPage(page + 1)}
                >
                  <ChevronRight size={16} />
                </Button>
              </div>
            </footer>
          </>
        ) : (
          <div className="empty">
            <h3>
              {q || selected.length
                ? "Nenhum resultado encontrado"
                : "Nenhum registro ainda"}
            </h3>
            <p>
              {q || selected.length
                ? "Tente outra busca ou tire um filtro."
                : (data.help ??
                  "Crie o primeiro registro aqui; ele será gravado no Odoo.")}
            </p>
          </div>
        )}
      </section>
      <p className="data-note">
        <ShieldCheck size={14} /> Somente registros da empresa vinculada. Cada
        alteração fica registrada na auditoria ERA.
      </p>
      {opened && (
        <OpenedDialog
          opened={opened}
          permissions={permissions}
          onClose={() => {
            setOpened(null);
            void list.refetch();
          }}
          onAction={handle}
        />
      )}
    </>
  );
}

// Resultado de um botão: abrir registro, assistente, lista ou PDF.
function useActionHandler(
  setOpened: (opened: Opened | null) => void,
  onPush: ((screen: Screen) => void) | undefined,
  setNotice: (text: string | null) => void,
  reload: () => void,
) {
  return (action: RunAction) => {
    if (action.kind === "reload") return reload();
    if (action.kind === "message")
      return setNotice(
        action.title + (action.message ? ": " + action.message : ""),
      );
    if (action.kind === "report") {
      openReport(action.report, action.ids).catch((error: Error) =>
        setNotice(error.message),
      );
      return;
    }
    if (action.target === "new")
      return setOpened({
        kind: "wizard",
        model: action.model,
        view: action.views.form,
        context: action.context,
        title: action.title,
      });
    if (action.resId || !action.modes.includes("list"))
      return setOpened({
        kind: "record",
        model: action.model,
        id: action.resId ?? undefined,
        view: action.views.form,
        context: action.context,
      });
    if (onPush)
      onPush({
        title: action.title,
        action: undefined,
        model: action.model,
        domain: action.domain ?? [],
        context: action.context,
        formView: action.views.form,
      });
    reload();
  };
}

function OpenedDialog({
  opened,
  permissions,
  onClose,
  onAction,
}: {
  opened: Opened;
  permissions: string[];
  onClose: () => void;
  onAction: (action: RunAction) => void;
}) {
  return opened.kind === "wizard" ? (
    <WizardDialog
      model={opened.model}
      view={opened.view}
      context={opened.context}
      title={opened.title}
      permissions={permissions}
      onClose={onClose}
      onDone={(action) => {
        onClose();
        onAction(action);
      }}
    />
  ) : (
    <RecordDialog
      model={opened.model}
      id={opened.id}
      view={opened.view}
      context={opened.context}
      permissions={permissions}
      onClose={onClose}
    />
  );
}

// ---- formulário de registro ------------------------------------------------

function visibleButtons(schema: FormSchema, values: Values) {
  const seen = new Set<string>();
  return (schema.buttons ?? []).filter((b) => {
    if (check(b.invisibleIf, values)) return false;
    const key = b.name + "|" + b.label;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function useDialog() {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return ref;
}

export function RecordDialog({
  model,
  id: initialId,
  view,
  context,
  permissions,
  onClose,
}: {
  model: string;
  id?: number;
  view?: number;
  context?: Values;
  permissions: string[];
  onClose: () => void;
}) {
  const dialog = useDialog();
  const cache = useQueryClient();
  const [id, setId] = useState(initialId);
  const [opened, setOpened] = useState<Opened | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const endpoint = endpointOf(model, view, context);
  const form = useQuery({
    queryKey: ["odoo-run", "form", endpoint, id ?? "new"],
    queryFn: () =>
      api<RecordForm>(endpoint + (id ? "/" + id + "/form" : "/form")),
    staleTime: 0,
    gcTime: 0,
  });
  const state = useOdooForm({});
  const { reset } = state;
  useEffect(() => {
    if (form.data) reset(form.data.values);
  }, [form.data, reset]);
  const canWrite = permissions.includes("odoo:write");
  const refresh = async () => {
    void cache.invalidateQueries({ queryKey: ["odoo-run", "list"] });
    void cache.invalidateQueries({ queryKey: ["odoo-run", "messages"] });
    await form.refetch();
  };
  const saveNow = async (): Promise<number> => {
    const schema = form.data!.schema;
    if (id && !state.dirty.size) return id;
    const values = toPayload(schema, id ? state.changed : state.values);
    const body = JSON.stringify({ values });
    const result = id
      ? await api<{ id: number }>(endpoint + "/" + id, {
          method: "PATCH",
          body,
        })
      : await api<{ id: number }>(endpoint, { method: "POST", body });
    setId(result.id);
    return result.id;
  };
  const save = useMutation({
    mutationFn: saveNow,
    onSuccess: async (newId) => {
      void cache.invalidateQueries({ queryKey: ["odoo-run", "list"] });
      void cache.invalidateQueries({ queryKey: ["audit"] });
      if (newId === id) await form.refetch();
    },
  });
  const handle = useActionHandler(setOpened, undefined, setNotice, () => {
    void refresh();
  });
  const press = useMutation({
    mutationFn: async (button: ButtonDef) => {
      const recordId = await saveNow();
      return api<RunAction>(endpoint + "/" + recordId + "/button", {
        method: "POST",
        body: JSON.stringify({ name: button.name }),
      });
    },
    onSuccess: async (action) => {
      await refresh();
      handle(action);
    },
  });
  const remove = useMutation({
    mutationFn: () => api(endpoint + "/" + id, { method: "DELETE" }),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ["odoo-run", "list"] });
      onClose();
    },
  });
  const busy = save.isPending || press.isPending || remove.isPending;
  const data = form.data;
  const status =
    data?.schema.status &&
    data.schema.status.selection.find(
      ([key]) => key === state.values[data.schema.status!.name],
    )?.[1];
  const buttons = data ? visibleButtons(data.schema, state.values) : [];
  const error = save.error ?? press.error ?? remove.error;
  return (
    <dialog
      ref={dialog}
      className="modal modal-wide"
      aria-labelledby="run-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="modal-heading">
        <div>
          <p className="eyebrow">
            {(data?.model.name ?? "ODOO").toUpperCase()}
          </p>
          <h2 id="run-title">
            {data ? (id ? data.title : "Novo registro") : "Carregando…"}
          </h2>
        </div>
        <Button
          variant="outline"
          aria-label="Fechar"
          onClick={onClose}
          disabled={busy}
        >
          <X size={17} />
        </Button>
      </div>
      {form.error ? (
        <div className="empty" role="alert">
          <p>{form.error.message}</p>
          <Button variant="outline" onClick={() => form.refetch()}>
            Tentar novamente
          </Button>
        </div>
      ) : !data ? (
        <div className="empty">Carregando o formulário do Odoo…</div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          {(status || (canWrite && buttons.length > 0)) && (
            <div className="run-buttons">
              {status && <span className="badge stage-open">{status}</span>}
              {canWrite &&
                buttons.map((button) => (
                  <Button
                    key={button.name + button.label}
                    type="button"
                    size="sm"
                    variant={button.primary ? undefined : "outline"}
                    disabled={busy}
                    onClick={() => {
                      if (!button.confirm || confirm(button.confirm))
                        press.mutate(button);
                    }}
                  >
                    {button.label}
                  </Button>
                ))}
            </div>
          )}
          {notice && (
            <p className="run-notice" role="status">
              {notice}
            </p>
          )}
          <OdooFormView
            schema={data.schema}
            values={state.values}
            onChange={state.change}
            scope={{ endpoint, recordId: id }}
            readOnly={!canWrite}
          />
          {error && (
            <p role="alert" className="error">
              {error.message}
            </p>
          )}
          <div className="form-actions">
            {id && data.model.reports.length > 0 && (
              <ReportMenu
                reports={data.model.reports}
                ids={[id]}
                onError={setNotice}
              />
            )}
            {id && canWrite && (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  if (confirm("Excluir este registro no Odoo?"))
                    remove.mutate();
                }}
              >
                <Trash2 size={15} /> Excluir
              </Button>
            )}
            <span className="spacer" />
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={busy}
            >
              Fechar
            </Button>
            {canWrite && (
              <Button disabled={busy || (!!id && !state.dirty.size)}>
                {save.isPending ? "Gravando no Odoo…" : id ? "Salvar" : "Criar"}
              </Button>
            )}
          </div>
          {id && data.model.chatter && (
            <Chatter endpoint={endpoint} id={id} canWrite={canWrite} />
          )}
        </form>
      )}
      {opened && (
        <OpenedDialog
          opened={opened}
          permissions={permissions}
          onClose={() => {
            setOpened(null);
            void refresh();
          }}
          onAction={handle}
        />
      )}
    </dialog>
  );
}

function ReportMenu({
  reports,
  ids,
  onError,
}: {
  reports: Array<{ name: string; report: string }>;
  ids: number[];
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const print = async (report: string) => {
    setBusy(true);
    try {
      await openReport(report, ids);
    } catch (error) {
      onError((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (reports.length === 1)
    return (
      <Button
        type="button"
        variant="outline"
        disabled={busy}
        onClick={() => print(reports[0].report)}
      >
        <Printer size={15} /> {busy ? "Gerando PDF…" : reports[0].name}
      </Button>
    );
  return (
    <label className="run-print">
      <Printer size={15} />
      <select
        aria-label="Imprimir"
        value=""
        disabled={busy}
        onChange={(e) => e.target.value && print(e.target.value)}
      >
        <option value="">{busy ? "Gerando PDF…" : "Imprimir"}</option>
        {reports.map((r) => (
          <option key={r.report} value={r.report}>
            {r.name}
          </option>
        ))}
      </select>
    </label>
  );
}

type Message = {
  id: number;
  date: string;
  author: string | null;
  note: boolean;
  body: string;
  changes: Array<{ field: string; from: string; to: string }>;
};

function Chatter({
  endpoint,
  id,
  canWrite,
}: {
  endpoint: string;
  id: number;
  canWrite: boolean;
}) {
  const [text, setText] = useState("");
  const messages = useQuery({
    queryKey: ["odoo-run", "messages", endpoint, id],
    queryFn: () => api<Message[]>(endpoint + "/" + id + "/messages"),
  });
  const post = useMutation({
    mutationFn: (note: boolean) =>
      api(endpoint + "/" + id + "/messages", {
        method: "POST",
        body: JSON.stringify({ body: text, note }),
      }),
    onSuccess: () => {
      setText("");
      void messages.refetch();
    },
  });
  return (
    <section className="run-chatter" aria-label="Histórico e mensagens">
      <h3>Histórico e mensagens</h3>
      {canWrite && (
        <div className="run-chatter-new">
          <textarea
            aria-label="Nova mensagem"
            placeholder="Escreva uma nota interna ou mensagem aos seguidores…"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div>
            <Button
              type="button"
              size="sm"
              disabled={!text.trim() || post.isPending}
              onClick={() => post.mutate(true)}
            >
              Registrar nota
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!text.trim() || post.isPending}
              onClick={() => post.mutate(false)}
            >
              Enviar mensagem
            </Button>
          </div>
          {post.error && (
            <p role="alert" className="error">
              {post.error.message}
            </p>
          )}
        </div>
      )}
      {messages.data?.map((m) => (
        <article
          key={m.id}
          className={m.note ? "run-message note" : "run-message"}
        >
          <header>
            <strong>{m.author ?? "Sistema"}</strong>
            <time>{cell(m.date, "datetime")}</time>
          </header>
          {m.body && <p>{m.body}</p>}
          {m.changes.map((c, i) => (
            <p key={i} className="run-change">
              {c.field}: {c.from || "—"} → {c.to || "—"}
            </p>
          ))}
        </article>
      ))}
      {messages.data && !messages.data.length && (
        <p className="run-empty">Sem mensagens ainda.</p>
      )}
    </section>
  );
}

// ---- assistente (wizard) ---------------------------------------------------

function WizardDialog({
  model,
  view,
  context,
  title,
  permissions,
  onClose,
  onDone,
}: {
  model: string;
  view?: number;
  context: Values;
  title: string;
  permissions: string[];
  onClose: () => void;
  onDone: (action: RunAction) => void;
}) {
  const dialog = useDialog();
  const endpoint = endpointOf(model, view, context);
  const form = useQuery({
    queryKey: ["odoo-run", "wizard", endpoint],
    queryFn: () => api<RecordForm>(endpoint + "/form"),
    staleTime: 0,
    gcTime: 0,
  });
  const state = useOdooForm({});
  const { reset } = state;
  useEffect(() => {
    if (form.data) reset(form.data.values);
  }, [form.data, reset]);
  const run = useMutation({
    mutationFn: (button: ButtonDef) =>
      api<RunAction>(endpoint + "/wizard", {
        method: "POST",
        body: JSON.stringify({
          name: button.name,
          values: toPayload(form.data!.schema, state.values),
        }),
      }),
    onSuccess: onDone,
  });
  const canWrite = permissions.includes("odoo:write");
  const buttons = form.data
    ? visibleButtons(form.data.schema, state.values)
    : [];
  return (
    <dialog
      ref={dialog}
      className="modal modal-wide"
      aria-labelledby="wizard-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!run.isPending) onClose();
      }}
    >
      <div className="modal-heading">
        <div>
          <p className="eyebrow">ASSISTENTE · ODOO</p>
          <h2 id="wizard-title">{title || form.data?.title || "Assistente"}</h2>
        </div>
        <Button
          variant="outline"
          aria-label="Fechar"
          onClick={onClose}
          disabled={run.isPending}
        >
          <X size={17} />
        </Button>
      </div>
      {form.error ? (
        <div className="empty" role="alert">
          <p>{form.error.message}</p>
        </div>
      ) : !form.data ? (
        <div className="empty">Carregando…</div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const main = buttons.find((b) => b.primary) ?? buttons[0];
            if (main) run.mutate(main);
          }}
        >
          <OdooFormView
            schema={form.data.schema}
            values={state.values}
            onChange={state.change}
            scope={{ endpoint }}
            readOnly={!canWrite}
          />
          {run.error && (
            <p role="alert" className="error">
              {run.error.message}
            </p>
          )}
          <div className="form-actions">
            <span className="spacer" />
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={run.isPending}
            >
              Cancelar
            </Button>
            {canWrite &&
              buttons.map((button) => (
                <Button
                  key={button.name + button.label}
                  type="button"
                  variant={button.primary ? undefined : "outline"}
                  disabled={run.isPending}
                  onClick={() => {
                    if (!button.confirm || confirm(button.confirm))
                      run.mutate(button);
                  }}
                >
                  {run.isPending ? "Processando no Odoo…" : button.label}
                </Button>
              ))}
          </div>
        </form>
      )}
    </dialog>
  );
}

// ---- configurações -------------------------------------------------------

function Settings({
  permissions,
  onBack,
}: {
  permissions: string[];
  onBack: () => void;
}) {
  const cache = useQueryClient();
  const endpoint = endpointOf("res.config.settings");
  const allowed = permissions.includes("odoo:admin");
  const form = useQuery({
    queryKey: ["odoo-run", "settings"],
    queryFn: () => api<RecordForm>(endpoint + "/form"),
    enabled: allowed,
    staleTime: 0,
    gcTime: 0,
  });
  const state = useOdooForm({});
  const { reset } = state;
  useEffect(() => {
    if (form.data) reset(form.data.values);
  }, [form.data, reset]);
  const [section, setSection] = useState(0);
  const save = useMutation({
    mutationFn: () =>
      api<RunAction>(endpoint + "/wizard", {
        method: "POST",
        body: JSON.stringify({
          name: "execute",
          values: toPayload(form.data!.schema, state.values),
        }),
      }),
    onSuccess: async () => {
      void cache.invalidateQueries({ queryKey: ["odoo-run"] });
      await form.refetch();
    },
  });
  const schema = useMemo(() => {
    if (!form.data) return null;
    const s = form.data.schema;
    const current = s.sections[section] ?? s.sections[0];
    return { ...s, sections: current ? [current] : [] };
  }, [form.data, section]);
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">APLICATIVOS · ODOO</p>
          <h1>
            <button
              type="button"
              className="run-back"
              aria-label="Voltar"
              onClick={onBack}
            >
              <ArrowLeft size={20} />
            </button>
            Configurações
          </h1>
          <p>
            Preferências de cada aplicativo do Odoo. Ativar um recurso pode
            instalar módulos e levar alguns minutos.
          </p>
        </div>
        {allowed && form.data && (
          <Button
            disabled={save.isPending || !state.dirty.size}
            onClick={() => save.mutate()}
          >
            {save.isPending ? "Aplicando no Odoo…" : "Salvar"}
          </Button>
        )}
      </div>
      {!allowed ? (
        <div className="empty">
          <h3>Sem permissão</h3>
          <p>Peça a um administrador o acesso de configurações do Odoo.</p>
        </div>
      ) : form.error ? (
        <div className="empty" role="alert">
          <p>{form.error.message}</p>
        </div>
      ) : !form.data || !schema ? (
        <div className="empty">Carregando configurações do Odoo…</div>
      ) : (
        <section className="table-card run-settings">
          <div className="odoo-tabs" role="tablist">
            {form.data.schema.sections.map((s, i) => (
              <button
                type="button"
                role="tab"
                key={s.title}
                aria-selected={i === section}
                className={i === section ? "active" : ""}
                onClick={() => setSection(i)}
              >
                {s.title}
              </button>
            ))}
          </div>
          {save.error && (
            <p role="alert" className="error">
              {save.error.message}
            </p>
          )}
          {save.isSuccess && !state.dirty.size && (
            <p className="run-notice" role="status">
              Configurações gravadas no Odoo.
            </p>
          )}
          <OdooFormView
            schema={schema}
            values={state.values}
            onChange={state.change}
            scope={{ endpoint }}
          />
        </section>
      )}
    </>
  );
}

// ---- loja de aplicativos ---------------------------------------------------

type App = {
  id: number;
  name: string;
  title: string;
  summary: string | null;
  state: string;
  application: boolean;
  category: string | null;
  icon: string | null;
};
const appStates: Record<string, [string, string]> = {
  installed: ["done", "Instalado"],
  uninstalled: ["draft", "Não instalado"],
  "to install": ["waiting", "Instalando"],
  "to upgrade": ["waiting", "Atualizando"],
  "to remove": ["waiting", "Removendo"],
};

function AppStore({
  permissions,
  onBack,
}: {
  permissions: string[];
  onBack: () => void;
}) {
  const cache = useQueryClient();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("apps");
  const apps = useQuery({
    queryKey: ["odoo-run", "apps", q, filter],
    queryFn: () =>
      api<App[]>("odoo/run/apps?" + new URLSearchParams({ q, filter })),
  });
  const admin = permissions.includes("odoo:admin");
  const op = useMutation({
    mutationFn: ({ app, action }: { app: App; action: string }) =>
      api<{ state: string }>("odoo/run/apps/" + app.id + "/" + action, {
        method: "POST",
      }),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ["odoo-run"] });
    },
  });
  const base = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">APLICATIVOS · ODOO</p>
          <h1>
            <button
              type="button"
              className="run-back"
              aria-label="Voltar"
              onClick={onBack}
            >
              <ArrowLeft size={20} />
            </button>
            Loja de aplicativos
          </h1>
          <p>
            Instale, atualize ou remova aplicativos do Odoo. Eles passam a
            funcionar aqui na ERA logo após a instalação.
          </p>
        </div>
      </div>
      {op.isPending && (
        <p className="run-notice" role="status">
          {op.variables?.action === "install"
            ? "Instalando " + op.variables.app.title
            : op.variables?.action === "uninstall"
              ? "Removendo " + op.variables.app.title
              : "Atualizando " + op.variables?.app.title}{" "}
          no Odoo. Isso pode levar alguns minutos; não feche esta tela.
        </p>
      )}
      {op.error && (
        <p role="alert" className="error">
          {op.error.message}
        </p>
      )}
      <section className="table-card">
        <div className="table-toolbar">
          <h2>Aplicativos</h2>
          <div className="toolbar-filters">
            <select
              aria-label="Filtro"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="apps">Aplicativos</option>
              <option value="installed">Instalados</option>
              <option value="all">Todos os módulos</option>
            </select>
            <label className="search">
              <Search size={17} />
              <input
                aria-label="Buscar aplicativos"
                placeholder="Buscar aplicativo…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </label>
          </div>
        </div>
        {apps.error ? (
          <div className="empty" role="alert">
            <p>{apps.error.message}</p>
          </div>
        ) : !apps.data ? (
          <div className="empty">Buscando aplicativos no Odoo…</div>
        ) : (
          <div className="run-store">
            {apps.data.map((app) => {
              const [stage, label] = appStates[app.state] ?? [
                "open",
                app.state,
              ];
              return (
                <article key={app.id} className="run-store-card">
                  {app.icon ? (
                    <img
                      src={
                        base +
                        "/v1/odoo/run/icon?path=" +
                        encodeURIComponent(app.icon)
                      }
                      alt=""
                    />
                  ) : (
                    <span className="run-app-fallback">
                      <Puzzle size={20} />
                    </span>
                  )}
                  <div>
                    <strong>{app.title}</strong>
                    <span className={"badge stage-" + stage}>{label}</span>
                    {app.summary && <p>{app.summary}</p>}
                  </div>
                  {admin && (
                    <div className="run-store-actions">
                      {app.state === "uninstalled" && (
                        <Button
                          size="sm"
                          disabled={op.isPending}
                          onClick={() => op.mutate({ app, action: "install" })}
                        >
                          <Download size={14} /> Instalar
                        </Button>
                      )}
                      {app.state === "installed" && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={op.isPending}
                            onClick={() =>
                              op.mutate({ app, action: "upgrade" })
                            }
                          >
                            Atualizar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={op.isPending}
                            onClick={() => {
                              if (
                                confirm(
                                  "Remover " +
                                    app.title +
                                    " apaga do Odoo todos os dados desse aplicativo, para todas as empresas. Continuar?",
                                )
                              )
                                op.mutate({ app, action: "uninstall" });
                            }}
                          >
                            Remover
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
      {!admin && (
        <p className="data-note">
          <ShieldCheck size={14} /> Instalar e remover aplicativos exige a
          permissão de administrador do Odoo.
        </p>
      )}
    </>
  );
}

export function RunTitle({ children }: { children: ReactNode }) {
  return <span className="run-title">{children}</span>;
}
