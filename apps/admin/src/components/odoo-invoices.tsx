"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Plus,
  ReceiptText,
  Search,
  ShieldCheck,
} from "lucide-react";
import { api } from "../lib/session";
import { Button } from "./ui/button";
import { OdooUnavailable, useOdooStatus } from "./odoo-status";
import { OdooRecordDialog } from "./odoo-record-dialog";

type Side = "customer" | "vendor";
type Stage = "draft" | "open" | "paid" | "cancelled";
type Ref = { id: number; name: string } | null;
export type OdooInvoice = {
  id: number;
  number: string | null;
  type: string;
  refund: boolean;
  partner: Ref;
  date: string | null;
  due: string | null;
  reference: string | null;
  untaxed: string;
  taxes: string;
  total: string;
  residual: string;
  currency: string | null;
  stage: Stage;
  state: string;
  payment: string;
};
type Page = { items: OdooInvoice[]; total: number; pageSize: number };

const sides: Record<
  Side,
  { tab: string; partner: string; invoice: string; refund: string }
> = {
  customer: {
    tab: "A receber",
    partner: "Cliente",
    invoice: "Fatura de cliente",
    refund: "Nota de crédito",
  },
  vendor: {
    tab: "A pagar",
    partner: "Fornecedor",
    invoice: "Conta de fornecedor",
    refund: "Reembolso de fornecedor",
  },
};
const stageLabel: Record<Stage, string> = {
  draft: "Rascunho",
  open: "Em aberto",
  paid: "Paga",
  cancelled: "Cancelada",
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
// Datas de fatura vêm do Odoo como "AAAA-MM-DD" (sem horário).
const dateLabel = (value: string | null) =>
  value ? value.split("-").reverse().join("/") : "—";
function titleOf(invoice: OdooInvoice) {
  const side = sides[invoice.type.startsWith("out") ? "customer" : "vendor"];
  return (
    (invoice.refund ? side.refund : side.invoice) +
    (invoice.number ? " " + invoice.number : " (rascunho)")
  );
}

export function OdooInvoices({
  permissions,
  odooUrl,
}: {
  permissions: string[];
  odooUrl: string;
}) {
  const [side, setSide] = useState<Side>("customer");
  const [q, setQ] = useState("");
  const [stage, setStage] = useState<"all" | Stage>("all");
  const [page, setPage] = useState(1);
  const [opened, setOpened] = useState<number | "new" | "refund" | null>(
    null,
  );
  const canCreate = permissions.includes("invoices:create");
  const { status: integration, ready } = useOdooStatus();
  const invoices = useQuery({
    queryKey: ["odoo-invoices", side, q, stage, page],
    queryFn: () =>
      api<Page>(
        "odoo/invoices?" +
          new URLSearchParams({
            side,
            q,
            stage,
            page: String(page),
          }).toString(),
      ),
    enabled: ready,
  });
  const pageSize = invoices.data?.pageSize ?? 20;
  const filtered = !!q || stage !== "all";
  const label = sides[side];
  const creating = opened === "new" || opened === "refund";
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">FINANCEIRO · DADOS DO ODOO</p>
          <h1>Faturas</h1>
          <p>
            Emita faturas de clientes, lance contas de fornecedores e registre
            pagamentos. Impostos, vencimentos e lançamentos contábeis são
            calculados pelo Odoo.
          </p>
        </div>
        {ready && canCreate && (
          <div className="form-actions">
            <Button variant="outline" onClick={() => setOpened("refund")}>
              {label.refund}
            </Button>
            <Button onClick={() => setOpened("new")}>
              <Plus size={17} /> {label.invoice}
            </Button>
          </div>
        )}
      </div>
      {!ready ? (
        <OdooUnavailable
          status={integration}
          icon={<ReceiptText size={24} />}
        />
      ) : (
        <>
          <div className="odoo-tabs" role="tablist">
            {(Object.keys(sides) as Side[]).map((key) => (
              <button
                type="button"
                role="tab"
                key={key}
                aria-selected={key === side}
                className={key === side ? "active" : ""}
                onClick={() => {
                  setSide(key);
                  setPage(1);
                }}
              >
                {sides[key].tab}
              </button>
            ))}
          </div>
          <section className="table-card">
            <div className="table-toolbar">
              <h2>{label.tab}</h2>
              <div className="toolbar-filters">
                <select
                  aria-label="Situação"
                  value={stage}
                  onChange={(e) => {
                    setStage(e.target.value as typeof stage);
                    setPage(1);
                  }}
                >
                  <option value="all">Todas</option>
                  <option value="draft">Rascunhos</option>
                  <option value="open">Em aberto</option>
                  <option value="paid">Pagas</option>
                  <option value="cancelled">Canceladas</option>
                </select>
                <label className="search">
                  <Search size={17} />
                  <input
                    aria-label="Buscar faturas"
                    placeholder="Buscar por número, parceiro ou referência…"
                    value={q}
                    onChange={(e) => {
                      setQ(e.target.value);
                      setPage(1);
                    }}
                  />
                </label>
              </div>
            </div>
            {invoices.error ? (
              <div className="empty" role="alert">
                <h3>Não foi possível carregar as faturas</h3>
                <p>{invoices.error.message}</p>
                <Button variant="outline" onClick={() => invoices.refetch()}>
                  Tentar novamente
                </Button>
              </div>
            ) : invoices.isPending ? (
              <div className="empty">Buscando faturas no Odoo…</div>
            ) : invoices.data.items.length ? (
              <>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Número</th>
                        <th>{label.partner}</th>
                        <th>Data</th>
                        <th>Vencimento</th>
                        <th className="numeric">Total</th>
                        <th className="numeric">Em aberto</th>
                        <th>Situação</th>
                        <th>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoices.data.items.map((invoice) => (
                        <tr key={invoice.id}>
                          <td>
                            <div className="product-name">
                              <span>
                                <ReceiptText size={18} />
                              </span>
                              <strong className="mono">
                                {invoice.number ?? "Rascunho"}
                              </strong>
                            </div>
                          </td>
                          <td>{invoice.partner?.name ?? "—"}</td>
                          <td>{dateLabel(invoice.date)}</td>
                          <td>{dateLabel(invoice.due)}</td>
                          <td className="numeric">
                            {money(invoice.total, invoice.currency)}
                          </td>
                          <td className="numeric">
                            {money(invoice.residual, invoice.currency)}
                          </td>
                          <td>
                            <span className={"badge stage-" + invoice.stage}>
                              {stageLabel[invoice.stage]}
                            </span>
                          </td>
                          <td>
                            <div className="row-actions">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setOpened(invoice.id)}
                              >
                                Abrir
                              </Button>
                              <a
                                className="row-link"
                                aria-label={
                                  "Abrir " +
                                  (invoice.number ?? "rascunho") +
                                  " no Odoo"
                                }
                                href={
                                  odooUrl +
                                  "/action-account.action_move_out_invoice_type/" +
                                  invoice.id
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
                  <span>{invoices.data.total} faturas encontradas</span>
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
                      disabled={page * pageSize >= invoices.data.total}
                      onClick={() => setPage(page + 1)}
                    >
                      <ChevronRight size={16} />
                    </Button>
                  </div>
                </footer>
              </>
            ) : (
              <div className="empty">
                <ReceiptText size={32} />
                <h3>
                  {filtered
                    ? "Nenhum resultado encontrado"
                    : side === "customer"
                      ? "Nenhuma fatura a receber"
                      : "Nenhuma conta a pagar"}
                </h3>
                <p>
                  {filtered
                    ? "Tente outra busca ou filtro."
                    : "Crie a primeira aqui; ela será gravada no Odoo."}
                </p>
              </div>
            )}
          </section>
          <p className="data-note">
            <ShieldCheck size={14} /> Somente faturas da empresa vinculada.
            Cada alteração fica registrada na auditoria ERA.
          </p>
        </>
      )}
      {opened && (
        <OdooRecordDialog<{ summary: OdooInvoice | null }>
          endpoint="odoo/invoices"
          recordId={creating ? undefined : (opened as number)}
          newQuery={"side=" + side + (opened === "refund" ? "&refund=1" : "")}
          eyebrow="FATURAS · ODOO"
          title={(form) =>
            opened === "new"
              ? label.invoice + " (nova)"
              : opened === "refund"
                ? label.refund + " (nova)"
                : form?.summary
                  ? titleOf(form.summary)
                  : "Carregando…"
          }
          canEdit={permissions.includes(
            creating ? "invoices:create" : "invoices:update",
          )}
          invalidate={["odoo-invoices"]}
          createLabel="Criar"
          // O tipo (fatura, nota de crédito) segue para a API ao criar.
          extraValues={(form) => ({ move_type: form.values.move_type })}
          header={(form) =>
            form.summary && <InvoiceSummary invoice={form.summary} />
          }
          actions={(form, busy) =>
            form.summary && (
              <InvoiceActions
                invoice={form.summary}
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

function InvoiceSummary({ invoice }: { invoice: OdooInvoice }) {
  return (
    <dl className="sale-facts">
      <div>
        <dt>Situação</dt>
        <dd>
          <span className={"badge stage-" + invoice.stage}>
            {stageLabel[invoice.stage]}
          </span>
        </dd>
      </div>
      <div>
        <dt>Subtotal</dt>
        <dd>{money(invoice.untaxed, invoice.currency)}</dd>
      </div>
      <div>
        <dt>Impostos</dt>
        <dd>{money(invoice.taxes, invoice.currency)}</dd>
      </div>
      <div>
        <dt>Total</dt>
        <dd>{money(invoice.total, invoice.currency)}</dd>
      </div>
      <div>
        <dt>Em aberto</dt>
        <dd>{money(invoice.residual, invoice.currency)}</dd>
      </div>
      <div>
        <dt>Vencimento</dt>
        <dd>{dateLabel(invoice.due)}</dd>
      </div>
    </dl>
  );
}

// Etapas do Odoo; bloqueadas enquanto há alterações não salvas.
function InvoiceActions({
  invoice,
  busy,
  permissions,
}: {
  invoice: OdooInvoice;
  busy: boolean;
  permissions: string[];
}) {
  const cache = useQueryClient();
  const action = useMutation({
    mutationFn: (name: "post" | "pay" | "draft" | "cancel") =>
      api<OdooInvoice>("odoo/invoices/" + invoice.id + "/" + name, {
        method: "POST",
      }),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ["odoo-invoices"] });
      void cache.invalidateQueries({ queryKey: ["odoo-form"] });
      void cache.invalidateQueries({ queryKey: ["audit"] });
    },
  });
  if (!permissions.includes("invoices:post")) return null;
  const disabled = busy || action.isPending;
  const hint = busy ? "Salve as alterações antes" : undefined;
  const { stage } = invoice;
  return (
    <>
      {stage === "draft" && (
        <Button
          type="button"
          disabled={disabled}
          title={hint}
          onClick={() => action.mutate("post")}
        >
          Confirmar
        </Button>
      )}
      {stage === "open" && (
        <Button
          type="button"
          disabled={disabled}
          title={hint}
          onClick={() => {
            if (
              confirm(
                "Registrar o pagamento de " +
                  money(invoice.residual, invoice.currency) +
                  " no Odoo?",
              )
            )
              action.mutate("pay");
          }}
        >
          Registrar pagamento
        </Button>
      )}
      {(stage === "open" || stage === "cancelled") && (
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={() => action.mutate("draft")}
        >
          Voltar para rascunho
        </Button>
      )}
      {stage === "draft" && (
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={() => {
            if (confirm("Cancelar esta fatura no Odoo?"))
              action.mutate("cancel");
          }}
        >
          Cancelar
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
