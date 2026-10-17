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
} from "lucide-react";
import { api } from "../lib/session";
import { Button } from "./ui/button";
import { OdooUnavailable, useOdooStatus } from "./odoo-status";
import { OdooRecordDialog } from "./odoo-record-dialog";

type Stage = "quotation" | "order" | "cancelled";
type Ref = { id: number; name: string } | null;
export type OdooSale = {
  id: number;
  number: string;
  customer: Ref;
  stage: Stage;
  sent: boolean;
  date: string;
  validUntil: string | null;
  customerRef: string | null;
  untaxed: string;
  taxes: string;
  total: string;
  currency: string | null;
  invoiceStatus: string;
};
type Page = { items: OdooSale[]; total: number; pageSize: number };

const stageLabel: Record<Stage, string> = {
  quotation: "Orçamento",
  order: "Pedido de venda",
  cancelled: "Cancelado",
};
const invoiceLabel: Record<string, string> = {
  no: "Nada a faturar",
  "to invoice": "A faturar",
  invoiced: "Faturado",
  upselling: "Oportunidade de venda adicional",
};
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

export function OdooSales({
  permissions,
  odooUrl,
}: {
  permissions: string[];
  odooUrl: string;
}) {
  const [q, setQ] = useState("");
  const [stage, setStage] = useState<"all" | Stage>("all");
  const [page, setPage] = useState(1);
  const [opened, setOpened] = useState<number | "new" | null>(null);
  const canCreate = permissions.includes("sales:create");
  const { status: integration, ready } = useOdooStatus();
  const sales = useQuery({
    queryKey: ["odoo-sales", q, stage, page],
    queryFn: () =>
      api<Page>(
        "odoo/sales?" +
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
          <p className="eyebrow">COMERCIAL · DADOS DO ODOO</p>
          <h1>Vendas</h1>
          <p>
            Monte orçamentos, confirme pedidos e acompanhe as vendas. Preços,
            impostos e totais são calculados e gravados pelo Odoo.
          </p>
        </div>
        {ready && canCreate && (
          <Button onClick={() => setOpened("new")}>
            <Plus size={17} /> Novo orçamento
          </Button>
        )}
      </div>
      {!ready ? (
        <OdooUnavailable
          status={integration}
          icon={<ShoppingCart size={24} />}
        />
      ) : (
        <>
          <section className="table-card">
            <div className="table-toolbar">
              <h2>Orçamentos e pedidos</h2>
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
                  <option value="quotation">Orçamentos</option>
                  <option value="order">Pedidos de venda</option>
                  <option value="cancelled">Cancelados</option>
                </select>
                <label className="search">
                  <Search size={17} />
                  <input
                    aria-label="Buscar vendas"
                    placeholder="Buscar por número, cliente ou referência…"
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
                <h3>Não foi possível carregar as vendas</h3>
                <p>{sales.error.message}</p>
                <Button variant="outline" onClick={() => sales.refetch()}>
                  Tentar novamente
                </Button>
              </div>
            ) : sales.isPending ? (
              <div className="empty">Buscando vendas no Odoo…</div>
            ) : sales.data.items.length ? (
              <>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Número</th>
                        <th>Cliente</th>
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
                                <ShoppingCart size={18} />
                              </span>
                              <strong className="mono">{s.number}</strong>
                            </div>
                          </td>
                          <td>{s.customer?.name ?? "—"}</td>
                          <td>{dateLabel(s.date)}</td>
                          <td>
                            <span className={"badge stage-" + s.stage}>
                              {stageLabel[s.stage]}
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
                                  odooUrl +
                                  "/action-sale.action_quotations_with_onboarding/" +
                                  s.id
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
                <ShoppingCart size={32} />
                <h3>
                  {filtered
                    ? "Nenhum resultado encontrado"
                    : "Nenhuma venda registrada"}
                </h3>
                <p>
                  {filtered
                    ? "Tente outra busca ou filtro."
                    : "Crie o primeiro orçamento; ele será gravado no Odoo."}
                </p>
              </div>
            )}
          </section>
          <p className="data-note">
            <ShieldCheck size={14} /> Somente vendas da empresa vinculada. Cada
            alteração fica registrada na auditoria ERA.
          </p>
        </>
      )}
      {opened && (
        <OdooRecordDialog<{ summary: OdooSale | null }>
          endpoint="odoo/sales"
          recordId={opened === "new" ? undefined : opened}
          eyebrow="VENDAS · ODOO"
          title={(form) =>
            opened === "new"
              ? "Novo orçamento"
              : form?.summary
                ? stageLabel[form.summary.stage] + " " + form.summary.number
                : "Carregando…"
          }
          canEdit={
            opened === "new"
              ? permissions.includes("sales:create")
              : permissions.includes("sales:update")
          }
          invalidate={["odoo-sales"]}
          createLabel="Criar orçamento"
          header={(form) => form.summary && <SaleSummary sale={form.summary} />}
          actions={(form, busy) =>
            form.summary && (
              <SaleActions
                sale={form.summary}
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


function SaleSummary({ sale }: { sale: OdooSale }) {
  return (
    <dl className="sale-facts">
      <div>
        <dt>Situação</dt>
        <dd>
          <span className={"badge stage-" + sale.stage}>
            {stageLabel[sale.stage]}
          </span>
        </dd>
      </div>
      <div>
        <dt>Subtotal</dt>
        <dd>{money(sale.untaxed, sale.currency)}</dd>
      </div>
      <div>
        <dt>Impostos</dt>
        <dd>{money(sale.taxes, sale.currency)}</dd>
      </div>
      <div>
        <dt>Total</dt>
        <dd>{money(sale.total, sale.currency)}</dd>
      </div>
      <div>
        <dt>Faturamento</dt>
        <dd>{invoiceLabel[sale.invoiceStatus] ?? sale.invoiceStatus}</dd>
      </div>
    </dl>
  );
}

// Confirmar, cancelar e reabrir; bloqueados enquanto há alterações não salvas.
function SaleActions({
  sale,
  busy,
  permissions,
}: {
  sale: OdooSale;
  busy: boolean;
  permissions: string[];
}) {
  const cache = useQueryClient();
  const action = useMutation({
    mutationFn: (name: "confirm" | "cancel" | "reopen") =>
      api<OdooSale>("odoo/sales/" + sale.id + "/" + name, { method: "POST" }),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ["odoo-sales"] });
      void cache.invalidateQueries({ queryKey: ["odoo-form"] });
      void cache.invalidateQueries({ queryKey: ["audit"] });
    },
  });
  const disabled = busy || action.isPending;
  return (
    <>
      {sale.stage === "quotation" && permissions.includes("sales:confirm") && (
        <Button
          type="button"
          disabled={disabled}
          title={busy ? "Salve as alterações antes" : undefined}
          onClick={() => action.mutate("confirm")}
        >
          Confirmar pedido
        </Button>
      )}
      {sale.stage !== "cancelled" && permissions.includes("sales:confirm") && (
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={() => {
            if (confirm("Cancelar " + sale.number + " no Odoo?"))
              action.mutate("cancel");
          }}
        >
          Cancelar {sale.stage === "order" ? "pedido" : "orçamento"}
        </Button>
      )}
      {sale.stage === "cancelled" && permissions.includes("sales:update") && (
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={() => action.mutate("reopen")}
        >
          Voltar para orçamento
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
