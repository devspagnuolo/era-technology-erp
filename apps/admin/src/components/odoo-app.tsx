"use client";
import { type ReactNode, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
  ShieldCheck,
} from "lucide-react";
import { api } from "../lib/session";
import { Button } from "./ui/button";
import { OdooUnavailable, useOdooStatus } from "./odoo-status";
import { OdooRecordDialog } from "./odoo-record-dialog";

// Tela de um módulo do Odoo descrita em configuração: lista com busca e
// filtros, formulário completo do Odoo, resumo e ações do próprio Odoo. CRM,
// Fabricação, Projeto e Funcionários usam esta tela.
export type Ref = { id: number; name: string } | null;
export type Row = { id: number } & Record<string, unknown>;
export type AppAction<T extends Row> = {
  name: string;
  label: string;
  when: (row: T) => boolean;
  confirm?: (row: T) => string;
  variant?: "outline";
  // Ações de arquivar/reativar gravam "active" no próprio registro.
  active?: boolean;
  permission?: string;
};
export type AppKind<T extends Row> = {
  endpoint: string;
  permission: string; // prefixo: crm, manufacturing...
  actionPermission?: string;
  eyebrow: string;
  title: string;
  description: string;
  icon: ReactNode;
  noun: { one: string; many: string; new: string; empty: string };
  filters: Array<[string, string]>; // [valor, rótulo]; o primeiro é o padrão
  searchPlaceholder: string;
  columns: Array<{
    label: string;
    numeric?: boolean;
    render: (row: T) => ReactNode;
  }>;
  facts?: (row: T) => Array<[string, ReactNode]>;
  actions?: AppAction<T>[];
  titleOf: (row: T) => string;
  odooPath: string; // ex.: /odoo/crm
};
type Page<T> = { items: T[]; total: number; pageSize: number };

export const refName = (value: unknown) => (value as Ref)?.name ?? "—";
export const dateLabel = (value: unknown) =>
  typeof value === "string" && value
    ? value.slice(0, 10).split("-").reverse().join("/")
    : "—";
export function money(value: unknown, currency?: unknown) {
  const amount = Number(value ?? 0);
  try {
    return amount.toLocaleString("pt-BR", {
      style: "currency",
      currency: typeof currency === "string" && currency ? currency : "BRL",
    });
  } catch {
    return amount.toFixed(2);
  }
}
export function Badge({ stage, label }: { stage: string; label: string }) {
  return <span className={"badge stage-" + stage}>{label}</span>;
}

export function OdooApp<T extends Row>({
  kind,
  permissions,
  odooUrl,
  query = {},
  toolbar,
  rowActions,
}: {
  kind: AppKind<T>;
  permissions: string[];
  odooUrl: string;
  // Recorte extra da lista e do novo registro (ex.: projeto da tarefa).
  query?: Record<string, string>;
  toolbar?: ReactNode;
  rowActions?: (row: T) => ReactNode;
}) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState(kind.filters[0][0]);
  const [page, setPage] = useState(1);
  const [opened, setOpened] = useState<number | "new" | null>(null);
  const can = (action: string) =>
    permissions.includes(kind.permission + ":" + action);
  const { status: integration, ready } = useOdooStatus();
  const extra = new URLSearchParams(query).toString();
  const list = useQuery({
    queryKey: [kind.endpoint, q, filter, page, extra],
    queryFn: () =>
      api<Page<T>>(
        kind.endpoint +
          "?" +
          new URLSearchParams({
            ...query,
            q,
            filter,
            page: String(page),
          }).toString(),
      ),
    enabled: ready,
  });
  const pageSize = list.data?.pageSize ?? 20;
  const filtered = !!q || filter !== kind.filters[0][0];
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">{kind.eyebrow} · DADOS DO ODOO</p>
          <h1>{kind.title}</h1>
          <p>{kind.description}</p>
        </div>
        {ready && can("create") && (
          <Button onClick={() => setOpened("new")}>
            <Plus size={17} /> {kind.noun.new}
          </Button>
        )}
      </div>
      {!ready ? (
        <OdooUnavailable status={integration} icon={kind.icon} />
      ) : (
        <>
          <section className="table-card">
            <div className="table-toolbar">
              <h2>{kind.noun.many}</h2>
              <div className="toolbar-filters">
                {toolbar}
                <select
                  aria-label="Filtro"
                  value={filter}
                  onChange={(e) => {
                    setFilter(e.target.value);
                    setPage(1);
                  }}
                >
                  {kind.filters.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <label className="search">
                  <Search size={17} />
                  <input
                    aria-label={"Buscar " + kind.noun.many.toLowerCase()}
                    placeholder={kind.searchPlaceholder}
                    value={q}
                    onChange={(e) => {
                      setQ(e.target.value);
                      setPage(1);
                    }}
                  />
                </label>
              </div>
            </div>
            {list.error ? (
              <div className="empty" role="alert">
                <h3>Não foi possível carregar os dados</h3>
                <p>{list.error.message}</p>
                <Button variant="outline" onClick={() => list.refetch()}>
                  Tentar novamente
                </Button>
              </div>
            ) : list.isPending ? (
              <div className="empty">Buscando no Odoo…</div>
            ) : list.data.items.length ? (
              <>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        {kind.columns.map((c) => (
                          <th
                            key={c.label}
                            className={c.numeric ? "numeric" : undefined}
                          >
                            {c.label}
                          </th>
                        ))}
                        <th>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.data.items.map((row) => (
                        <tr key={row.id}>
                          {kind.columns.map((c, i) => (
                            <td
                              key={c.label}
                              className={c.numeric ? "numeric" : undefined}
                            >
                              {i === 0 ? (
                                <div className="product-name">
                                  <span>{kind.icon}</span>
                                  <strong>{c.render(row)}</strong>
                                </div>
                              ) : (
                                c.render(row)
                              )}
                            </td>
                          ))}
                          <td>
                            <div className="row-actions">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setOpened(row.id)}
                              >
                                Abrir
                              </Button>
                              {rowActions?.(row)}
                              <a
                                className="row-link"
                                aria-label={
                                  "Abrir " + kind.titleOf(row) + " no Odoo"
                                }
                                href={odooUrl + kind.odooPath + "/" + row.id}
                                target="_blank"
                                rel="noreferrer"
                              >
                                <ArrowUpRight size={16} />
                              </a>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <footer className="table-footer">
                  <span>
                    {list.data.total} {kind.noun.many.toLowerCase()}
                  </span>
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
                      disabled={page * pageSize >= list.data.total}
                      onClick={() => setPage(page + 1)}
                    >
                      <ChevronRight size={16} />
                    </Button>
                  </div>
                </footer>
              </>
            ) : (
              <div className="empty">
                {kind.icon}
                <h3>
                  {filtered ? "Nenhum resultado encontrado" : kind.noun.empty}
                </h3>
                <p>
                  {filtered
                    ? "Tente outra busca ou filtro."
                    : "Crie o primeiro registro aqui; ele será gravado no Odoo."}
                </p>
              </div>
            )}
          </section>
          <p className="data-note">
            <ShieldCheck size={14} /> Somente registros da empresa vinculada.
            Cada alteração fica registrada na auditoria ERA.
          </p>
        </>
      )}
      {opened && (
        <OdooRecordDialog<{ summary: T | null }>
          endpoint={kind.endpoint}
          recordId={opened === "new" ? undefined : opened}
          newQuery={extra || undefined}
          eyebrow={kind.eyebrow + " · ODOO"}
          title={(form) =>
            opened === "new"
              ? kind.noun.new
              : form?.summary
                ? kind.titleOf(form.summary)
                : "Carregando…"
          }
          canEdit={can(opened === "new" ? "create" : "update")}
          invalidate={[kind.endpoint]}
          createLabel="Criar"
          header={(form) =>
            form.summary &&
            kind.facts && (
              <dl className="sale-facts">
                {kind.facts(form.summary).map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            )
          }
          actions={(form, busy) =>
            form.summary &&
            kind.actions && (
              <AppActions
                kind={kind}
                row={form.summary}
                busy={busy}
                permissions={permissions}
              />
            )
          }
          onClose={() => setOpened(null)}
        />
      )}
    </>
  );
}

// Ações do Odoo; bloqueadas enquanto há alterações não salvas.
function AppActions<T extends Row>({
  kind,
  row,
  busy,
  permissions,
}: {
  kind: AppKind<T>;
  row: T;
  busy: boolean;
  permissions: string[];
}) {
  const cache = useQueryClient();
  const run = useMutation({
    mutationFn: (action: AppAction<T>) =>
      action.active !== undefined
        ? api(kind.endpoint + "/" + row.id, {
            method: "PATCH",
            body: JSON.stringify({ active: action.active }),
          })
        : api(kind.endpoint + "/" + row.id + "/" + action.name, {
            method: "POST",
            body: JSON.stringify({}),
          }),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: [kind.endpoint] });
      void cache.invalidateQueries({ queryKey: ["odoo-form"] });
      void cache.invalidateQueries({ queryKey: ["audit"] });
    },
  });
  const allowed = (action: AppAction<T>) =>
    permissions.includes(
      action.permission ??
        (action.active !== undefined
          ? kind.permission + ":update"
          : (kind.actionPermission ?? kind.permission + ":update")),
    );
  const visible = (kind.actions ?? []).filter((a) => a.when(row) && allowed(a));
  if (!visible.length) return null;
  const disabled = busy || run.isPending;
  return (
    <>
      {visible.map((action) => (
        <Button
          key={action.name}
          type="button"
          variant={action.variant}
          disabled={disabled}
          title={busy ? "Salve as alterações antes" : undefined}
          onClick={() => {
            if (!action.confirm || confirm(action.confirm(row)))
              run.mutate(action);
          }}
        >
          {action.label}
        </Button>
      ))}
      {run.error && (
        <span role="alert" className="error">
          {run.error.message}
        </span>
      )}
    </>
  );
}
