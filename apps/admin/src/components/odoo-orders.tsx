"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
  ShieldCheck,
  ShoppingCart,
  Truck,
} from "lucide-react";
import { api } from "../lib/session";
import { Button } from "./ui/button";
import { OdooUnavailable, useOdooStatus } from "./odoo-status";
import { OdooRecordDialog } from "./odoo-record-dialog";

type Stage = "quotation" | "order" | "cancelled";
type Ref = { id: number; name: string } | null;
export type OdooOrder = {
  id: number;
  number: string;
  partner: Ref;
  stage: Stage;
  state: string;
  date: string;
  reference: string | null;
  untaxed: string;
  taxes: string;
  total: string;
  currency: string | null;
  invoiceStatus: string;
};
type Page = { items: OdooOrder[]; total: number; pageSize: number };

// Textos e permissões de cada tipo de pedido (venda, compra).
export type OrderKind = {
  endpoint: string; // ex.: "odoo/sales"
  permission: string; // ex.: "sales"
  eyebrow: string;
  dialogEyebrow: string;
  title: string;
  intro: string;
  listTitle: string;
  partnerLabel: string;
  searchLabel: string;
  stageLabels: Record<Stage, string>;
  stateLabels?: Record<string, string>; // situações do Odoo com nome próprio
  filterLabels: Record<Stage, string>;
  newLabel: string;
  createLabel: string;
  confirmLabel: string;
  cancelLabel: Record<"quotation" | "order", string>;
  reopenLabel: string;
  emptyTitle: string;
  emptyText: string;
  loading: string;
  scopeNote: string;
  odooAction: string; // ação do Odoo para o link "abrir no Odoo"
  icon: typeof ShoppingCart;
};

const invoiceLabel: Record<string, string> = {
  no: "Nada a faturar",
  "to invoice": "A faturar",
  invoiced: "Faturado",
  upselling: "Oportunidade de venda adicional",
};
const label = (kind: OrderKind, order: OdooOrder) =>
  kind.stateLabels?.[order.state] ?? kind.stageLabels[order.stage];
function money(value: string | number, currency: string | null) {
  const amount = Number(value);
  try {
    return amount.toLocaleString("pt-BR", {
      style: "currency",
      currency: currency ?? "BRL",
    });
  } catch {
    return amount.toFixed(2);
  }
}
// O Odoo devolve datas em UTC no formato "AAAA-MM-DD HH:MM:SS".
const dateLabel = (value: string) =>
  new Date(value.replace(" ", "T") + "Z").toLocaleDateString("pt-BR");

export function OdooOrders({
  kind,
  permissions,
  odooUrl,
}: {
  kind: OrderKind;
  permissions: string[];
  odooUrl: string;
}) {
  const Icon = kind.icon;
  const queryName = "odoo-" + kind.permission;
  const [q, setQ] = useState("");
  const [stage, setStage] = useState<"all" | Stage>("all");
  const [page, setPage] = useState(1);
  const [opened, setOpened] = useState<number | "new" | null>(null);
  const canCreate = permissions.includes(kind.permission + ":create");
  const { status: integration, ready } = useOdooStatus();
  const sales = useQuery({
    queryKey: [queryName, q, stage, page],
    queryFn: () =>
      api<Page>(
        kind.endpoint +
          "?" +
          new URLSearchParams({ q, stage, page: String(page) }).toString(),
      ),
    enabled: ready,
  });
  const pageSize = sales.data?.pageSize ?? 20;
  const filtered = !!q || stage !== "all";
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">{kind.eyebrow}</p>
          <h1>{kind.title}</h1>
          <p>{kind.intro}</p>
        </div>
        {ready && canCreate && (
          <Button onClick={() => setOpened("new")}>
            <Plus size={17} /> {kind.newLabel}
          </Button>
        )}
      </div>
      {!ready ? (
        <OdooUnavailable status={integration} icon={<Icon size={24} />} />
      ) : (
        <>
          <section className="table-card">
            <div className="table-toolbar">
              <h2>{kind.listTitle}</h2>
              <div className="toolbar-filters">
                <select
                  aria-label="Situação"
                  value={stage}
                  onChange={(e) => {
                    setStage(e.target.value as typeof stage);
                    setPage(1);
                  }}
                >
                  <option value="all">Todos</option>
                  <option value="quotation">
                    {kind.filterLabels.quotation}
                  </option>
                  <option value="order">{kind.filterLabels.order}</option>
                  <option value="cancelled">
                    {kind.filterLabels.cancelled}
                  </option>
                </select>
                <label className="search">
                  <Search size={17} />
                  <input
                    aria-label={"Buscar " + kind.title.toLowerCase()}
                    placeholder={kind.searchLabel}
                    value={q}
                    onChange={(e) => {
                      setQ(e.target.value);
                      setPage(1);
                    }}
                  />
                </label>
              </div>
            </div>
            {sales.error ? (
              <div className="empty" role="alert">
                <h3>Não foi possível carregar {kind.title.toLowerCase()}</h3>
                <p>{sales.error.message}</p>
                <Button variant="outline" onClick={() => sales.refetch()}>
                  Tentar novamente
                </Button>
              </div>
            ) : sales.isPending ? (
              <div className="empty">{kind.loading}</div>
            ) : sales.data.items.length ? (
              <>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Número</th>
                        <th>{kind.partnerLabel}</th>
                        <th>Data</th>
                        <th>Situação</th>
                        <th className="numeric">Total</th>
                        <th>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sales.data.items.map((s) => (
                        <tr key={s.id}>
                          <td>
                            <div className="product-name">
                              <span>
                                <Icon size={18} />
                              </span>
                              <strong className="mono">{s.number}</strong>
                            </div>
                          </td>
                          <td>{s.partner?.name ?? "—"}</td>
                          <td>{dateLabel(s.date)}</td>
                          <td>
                            <span className={"badge stage-" + s.stage}>
                              {label(kind, s)}
                            </span>
                          </td>
                          <td className="numeric">
                            {money(s.total, s.currency)}
                          </td>
                          <td>
                            <div className="row-actions">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setOpened(s.id)}
                              >
                                Abrir
                              </Button>
                              <a
                                className="row-link"
                                aria-label={"Abrir " + s.number + " no Odoo"}
                                href={
                                  odooUrl + "/" + kind.odooAction + "/" + s.id
                                }
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
                  <span>{sales.data.total} documentos encontrados</span>
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
                      disabled={page * pageSize >= sales.data.total}
                      onClick={() => setPage(page + 1)}
                    >
                      <ChevronRight size={16} />
                    </Button>
                  </div>
                </footer>
              </>
            ) : (
              <div className="empty">
                <Icon size={32} />
                <h3>
                  {filtered ? "Nenhum resultado encontrado" : kind.emptyTitle}
                </h3>
                <p>
                  {filtered ? "Tente outra busca ou filtro." : kind.emptyText}
                </p>
              </div>
            )}
          </section>
          <p className="data-note">
            <ShieldCheck size={14} /> {kind.scopeNote} Cada alteração fica
            registrada na auditoria ERA.
          </p>
        </>
      )}
      {opened && (
        <OdooRecordDialog<{ summary: OdooOrder | null }>
          endpoint={kind.endpoint}
          recordId={opened === "new" ? undefined : opened}
          eyebrow={kind.dialogEyebrow}
          title={(form) =>
            opened === "new"
              ? kind.newLabel
              : form?.summary
                ? label(kind, form.summary) + " " + form.summary.number
                : "Carregando…"
          }
          canEdit={permissions.includes(
            kind.permission + (opened === "new" ? ":create" : ":update"),
          )}
          invalidate={[queryName]}
          createLabel={kind.createLabel}
          header={(form) =>
            form.summary && <OrderSummary kind={kind} order={form.summary} />
          }
          actions={(form, busy) =>
            form.summary && (
              <OrderActions
                kind={kind}
                order={form.summary}
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

function OrderSummary({ kind, order }: { kind: OrderKind; order: OdooOrder }) {
  return (
    <dl className="sale-facts">
      <div>
        <dt>Situação</dt>
        <dd>
          <span className={"badge stage-" + order.stage}>
            {label(kind, order)}
          </span>
        </dd>
      </div>
      <div>
        <dt>Subtotal</dt>
        <dd>{money(order.untaxed, order.currency)}</dd>
      </div>
      <div>
        <dt>Impostos</dt>
        <dd>{money(order.taxes, order.currency)}</dd>
      </div>
      <div>
        <dt>Total</dt>
        <dd>{money(order.total, order.currency)}</dd>
      </div>
      <div>
        <dt>Faturamento</dt>
        <dd>{invoiceLabel[order.invoiceStatus] ?? order.invoiceStatus}</dd>
      </div>
    </dl>
  );
}

// Confirmar, cancelar e reabrir; bloqueados enquanto há alterações não salvas.
function OrderActions({
  kind,
  order,
  busy,
  permissions,
}: {
  kind: OrderKind;
  order: OdooOrder;
  busy: boolean;
  permissions: string[];
}) {
  const cache = useQueryClient();
  const action = useMutation({
    mutationFn: (name: "confirm" | "cancel" | "reopen") =>
      api<OdooOrder>(kind.endpoint + "/" + order.id + "/" + name, {
        method: "POST",
      }),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ["odoo-" + kind.permission] });
      void cache.invalidateQueries({ queryKey: ["odoo-form"] });
      void cache.invalidateQueries({ queryKey: ["audit"] });
    },
  });
  const disabled = busy || action.isPending;
  const may = (what: string) => permissions.includes(kind.permission + what);
  return (
    <>
      {["draft", "sent"].includes(order.state) && may(":confirm") && (
        <Button
          type="button"
          disabled={disabled}
          title={busy ? "Salve as alterações antes" : undefined}
          onClick={() => action.mutate("confirm")}
        >
          {kind.confirmLabel}
        </Button>
      )}
      {order.stage !== "cancelled" && may(":confirm") && (
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={() => {
            if (confirm("Cancelar " + order.number + " no Odoo?"))
              action.mutate("cancel");
          }}
        >
          {kind.cancelLabel[order.stage === "order" ? "order" : "quotation"]}
        </Button>
      )}
      {order.stage === "cancelled" && may(":update") && (
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={() => action.mutate("reopen")}
        >
          {kind.reopenLabel}
        </Button>
      )}
      {action.error && (
        <span role="alert" className="error">
          {action.error.message}
        </span>
      )}
    </>
  );
}

export const SALES: OrderKind = {
  endpoint: "odoo/sales",
  permission: "sales",
  eyebrow: "COMERCIAL · DADOS DO ODOO",
  dialogEyebrow: "VENDAS · ODOO",
  title: "Vendas",
  intro:
    "Monte orçamentos, confirme pedidos e acompanhe as vendas. Preços, impostos e totais são calculados e gravados pelo Odoo.",
  listTitle: "Orçamentos e pedidos",
  partnerLabel: "Cliente",
  searchLabel: "Buscar por número, cliente ou referência…",
  stageLabels: {
    quotation: "Orçamento",
    order: "Pedido de venda",
    cancelled: "Cancelado",
  },
  filterLabels: {
    quotation: "Orçamentos",
    order: "Pedidos de venda",
    cancelled: "Cancelados",
  },
  newLabel: "Novo orçamento",
  createLabel: "Criar orçamento",
  confirmLabel: "Confirmar pedido",
  cancelLabel: { quotation: "Cancelar orçamento", order: "Cancelar pedido" },
  reopenLabel: "Voltar para orçamento",
  emptyTitle: "Nenhuma venda registrada",
  emptyText: "Crie o primeiro orçamento; ele será gravado no Odoo.",
  loading: "Buscando vendas no Odoo…",
  scopeNote: "Somente vendas da empresa vinculada.",
  odooAction: "action-sale.action_quotations_with_onboarding",
  icon: ShoppingCart,
};

export const PURCHASES: OrderKind = {
  endpoint: "odoo/purchases",
  permission: "purchases",
  eyebrow: "OPERAÇÃO · DADOS DO ODOO",
  dialogEyebrow: "COMPRAS · ODOO",
  title: "Compras",
  intro:
    "Peça cotações a fornecedores, confirme pedidos de compra e acompanhe recebimento e faturamento. Preços, impostos e totais são calculados e gravados pelo Odoo.",
  listTitle: "Cotações e pedidos de compra",
  partnerLabel: "Fornecedor",
  searchLabel: "Buscar por número, fornecedor ou referência…",
  stageLabels: {
    quotation: "Solicitação de cotação",
    order: "Pedido de compra",
    cancelled: "Cancelado",
  },
  stateLabels: { "to approve": "Aguardando aprovação", done: "Bloqueado" },
  filterLabels: {
    quotation: "Solicitações de cotação",
    order: "Pedidos de compra",
    cancelled: "Cancelados",
  },
  newLabel: "Nova solicitação de cotação",
  createLabel: "Criar solicitação",
  confirmLabel: "Confirmar pedido",
  cancelLabel: { quotation: "Cancelar solicitação", order: "Cancelar pedido" },
  reopenLabel: "Voltar para cotação",
  emptyTitle: "Nenhuma compra registrada",
  emptyText:
    "Crie a primeira solicitação de cotação; ela será gravada no Odoo.",
  loading: "Buscando compras no Odoo…",
  scopeNote: "Somente compras da empresa vinculada.",
  odooAction: "action-purchase.purchase_rfq",
  icon: Truck,
};
