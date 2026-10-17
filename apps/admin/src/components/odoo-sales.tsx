"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
  ShieldCheck,
  ShoppingCart,
  Trash2,
  X,
} from "lucide-react";
import { api } from "../lib/session";
import { Button } from "./ui/button";
import { OdooUnavailable, useOdooStatus } from "./odoo-status";

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
type SaleLine = {
  id: number;
  product: Ref;
  description: string;
  quantity: number;
  uom: string | null;
  price: string;
  discount: number;
  subtotal: string;
  total: string;
  delivered: number;
  invoiced: number;
};
type SaleDetail = OdooSale & { note: string | null; lines: SaleLine[] };
type Page = { items: OdooSale[]; total: number; pageSize: number };
type Options = {
  customers: Array<{ id: number; name: string; document: string | null }>;
  products: Array<{
    id: number;
    name: string;
    sku: string | null;
    price: string;
  }>;
};
type Draft = {
  productId: number;
  name: string;
  quantity: string;
  price: string;
  discount: string;
};

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
const decimal = (value: string) => Number(value.replace(",", "."));
const lineSubtotal = (line: Draft) =>
  decimal(line.quantity) *
  decimal(line.price) *
  (1 - (decimal(line.discount) || 0) / 100);

function useDebounced(value: string, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
function useSaleOptions(q: string, enabled: boolean) {
  const term = useDebounced(q);
  return useQuery({
    queryKey: ["odoo-sale-options", term],
    queryFn: () =>
      api<Options>(
        "odoo/sales/options?" + new URLSearchParams({ q: term }).toString(),
      ),
    enabled,
  });
}

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
        <SaleDialog
          saleId={opened === "new" ? undefined : opened}
          permissions={permissions}
          onClose={() => setOpened(null)}
        />
      )}
    </>
  );
}

function SaleDialog({
  saleId,
  permissions,
  onClose,
}: {
  saleId?: number;
  permissions: string[];
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const cache = useQueryClient();
  const detail = useQuery({
    queryKey: ["odoo-sale", saleId],
    queryFn: () => api<SaleDetail>("odoo/sales/" + saleId),
    enabled: saleId !== undefined,
  });
  const sale = detail.data;
  const editable =
    saleId === undefined
      ? permissions.includes("sales:create")
      : sale?.stage === "quotation" && permissions.includes("sales:update");
  const refresh = (updated?: SaleDetail) => {
    if (updated) cache.setQueryData(["odoo-sale", updated.id], updated);
    void cache.invalidateQueries({ queryKey: ["odoo-sales"] });
    void cache.invalidateQueries({ queryKey: ["audit"] });
  };
  const action = useMutation({
    mutationFn: (name: "confirm" | "cancel" | "reopen") =>
      api<SaleDetail>("odoo/sales/" + saleId + "/" + name, { method: "POST" }),
    onSuccess: (updated) => refresh(updated),
  });
  const busy = action.isPending;
  return (
    <dialog
      ref={dialog}
      className="modal modal-wide"
      aria-labelledby="sale-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="modal-heading">
        <div>
          <p className="eyebrow">VENDAS · ODOO</p>
          <h2 id="sale-title">
            {saleId === undefined
              ? "Novo orçamento"
              : sale
                ? stageLabel[sale.stage] + " " + sale.number
                : "Carregando…"}
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
      {saleId !== undefined && detail.error ? (
        <p role="alert" className="error">
          {detail.error.message}
        </p>
      ) : saleId !== undefined && !sale ? (
        <div className="empty">Buscando no Odoo…</div>
      ) : editable ? (
        <SaleForm
          key={sale?.id ?? "new"}
          sale={sale}
          onSaved={(saved) => {
            refresh(saved);
            if (!sale) onClose();
          }}
          onClose={onClose}
          busy={busy}
        />
      ) : (
        sale && <SaleSummary sale={sale} />
      )}
      {sale && (
        <>
          {action.error && (
            <p role="alert" className="error">
              {action.error.message}
            </p>
          )}
          <div className="form-actions sale-actions">
            {sale.stage === "quotation" &&
              permissions.includes("sales:confirm") && (
                <Button
                  disabled={busy}
                  onClick={() => action.mutate("confirm")}
                >
                  {busy ? "Gravando no Odoo…" : "Confirmar pedido"}
                </Button>
              )}
            {sale.stage !== "cancelled" &&
              permissions.includes("sales:confirm") && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    if (confirm("Cancelar " + sale.number + " no Odoo?"))
                      action.mutate("cancel");
                  }}
                >
                  Cancelar {sale.stage === "order" ? "pedido" : "orçamento"}
                </Button>
              )}
            {sale.stage === "cancelled" &&
              permissions.includes("sales:update") && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => action.mutate("reopen")}
                >
                  Voltar para orçamento
                </Button>
              )}
          </div>
        </>
      )}
    </dialog>
  );
}

function SaleSummary({ sale }: { sale: SaleDetail }) {
  return (
    <div className="sale-summary">
      <dl className="sale-facts">
        <div>
          <dt>Cliente</dt>
          <dd>{sale.customer?.name ?? "—"}</dd>
        </div>
        <div>
          <dt>Data</dt>
          <dd>{dateLabel(sale.date)}</dd>
        </div>
        <div>
          <dt>Faturamento</dt>
          <dd>{invoiceLabel[sale.invoiceStatus] ?? sale.invoiceStatus}</dd>
        </div>
        {sale.customerRef && (
          <div>
            <dt>Referência do cliente</dt>
            <dd>{sale.customerRef}</dd>
          </div>
        )}
      </dl>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th className="numeric">Qtd.</th>
              <th className="numeric">Preço</th>
              <th className="numeric">Desc.</th>
              <th className="numeric">Subtotal</th>
              {sale.stage === "order" && <th className="numeric">Entregue</th>}
            </tr>
          </thead>
          <tbody>
            {sale.lines.map((line) => (
              <tr key={line.id}>
                <td>{line.description}</td>
                <td className="numeric">
                  {line.quantity} {line.uom}
                </td>
                <td className="numeric">{money(line.price, sale.currency)}</td>
                <td className="numeric">
                  {line.discount ? line.discount + "%" : "—"}
                </td>
                <td className="numeric">
                  {money(line.subtotal, sale.currency)}
                </td>
                {sale.stage === "order" && (
                  <td className="numeric">{line.delivered}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Totals sale={sale} />
      {sale.note && <p className="sale-note">{sale.note}</p>}
    </div>
  );
}

function Totals({ sale }: { sale: SaleDetail }) {
  return (
    <dl className="sale-totals">
      <div>
        <dt>Subtotal</dt>
        <dd>{money(sale.untaxed, sale.currency)}</dd>
      </div>
      <div>
        <dt>Impostos</dt>
        <dd>{money(sale.taxes, sale.currency)}</dd>
      </div>
      <div className="grand">
        <dt>Total</dt>
        <dd>{money(sale.total, sale.currency)}</dd>
      </div>
    </dl>
  );
}

function SaleForm({
  sale,
  onSaved,
  onClose,
  busy,
}: {
  sale?: SaleDetail;
  onSaved: (sale: SaleDetail) => void;
  onClose: () => void;
  busy: boolean;
}) {
  const [customerQuery, setCustomerQuery] = useState("");
  const [productQuery, setProductQuery] = useState("");
  const customerOptions = useSaleOptions(customerQuery, true);
  const productOptions = useSaleOptions(productQuery, true);
  const [customer, setCustomer] = useState<Ref>(sale?.customer ?? null);
  const [validUntil, setValidUntil] = useState(sale?.validUntil ?? "");
  const [customerRef, setCustomerRef] = useState(sale?.customerRef ?? "");
  const [note, setNote] = useState(sale?.note ?? "");
  const [lines, setLines] = useState<Draft[]>(
    sale?.lines
      .filter((line) => line.product)
      .map((line) => ({
        productId: line.product!.id,
        name: line.description,
        quantity: String(line.quantity),
        price: line.price,
        discount: line.discount ? String(line.discount) : "",
      })) ?? [],
  );
  const [problem, setProblem] = useState<string | null>(null);
  const customers = useMemo(() => {
    const found = customerOptions.data?.customers ?? [];
    return customer && !found.some((c) => c.id === customer.id)
      ? [{ ...customer, document: null }, ...found]
      : found;
  }, [customerOptions.data, customer]);
  const estimate = lines.reduce((sum, line) => sum + lineSubtotal(line), 0);
  const save = useMutation({
    mutationFn: () => {
      const body = {
        customerId: customer!.id,
        validUntil: validUntil || null,
        customerRef: customerRef.trim() || null,
        note: note.trim() || null,
        lines: lines.map((line) => ({
          productId: line.productId,
          quantity: decimal(line.quantity),
          price: decimal(line.price).toFixed(2),
          ...(line.discount ? { discount: decimal(line.discount) } : {}),
        })),
      };
      return sale
        ? api<SaleDetail>("odoo/sales/" + sale.id, {
            method: "PATCH",
            body: JSON.stringify(body),
          })
        : api<SaleDetail>("odoo/sales", {
            method: "POST",
            body: JSON.stringify(body),
          });
    },
    onSuccess: onSaved,
  });
  const update = (index: number, patch: Partial<Draft>) =>
    setLines(
      lines.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    );
  const pending = save.isPending || busy;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!customer) return setProblem("Escolha o cliente");
        if (!lines.length) return setProblem("Inclua ao menos um item");
        const invalid = lines.find(
          (line) =>
            !(decimal(line.quantity) > 0) ||
            !(decimal(line.price) >= 0) ||
            (line.discount &&
              !(decimal(line.discount) >= 0 && decimal(line.discount) <= 100)),
        );
        if (invalid)
          return setProblem(
            "Revise quantidade, preço e desconto de " + invalid.name,
          );
        setProblem(null);
        save.mutate();
      }}
    >
      <div className="form-grid">
        <label>
          Buscar cliente
          <input
            placeholder="Nome ou CPF/CNPJ"
            value={customerQuery}
            onChange={(e) => setCustomerQuery(e.target.value)}
          />
        </label>
        <label>
          Cliente
          <select
            aria-label="Cliente"
            value={customer?.id ?? ""}
            onChange={(e) => {
              const found = customers.find(
                (c) => c.id === Number(e.target.value),
              );
              setCustomer(found ? { id: found.id, name: found.name } : null);
            }}
          >
            <option value="">
              {customerOptions.isPending ? "Buscando…" : "Selecione"}
            </option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.document ? " · " + c.document : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          Validade do orçamento
          <input
            type="date"
            value={validUntil}
            onChange={(e) => setValidUntil(e.target.value)}
          />
        </label>
        <label>
          Referência do cliente
          <input
            placeholder="Opcional"
            value={customerRef}
            onChange={(e) => setCustomerRef(e.target.value)}
          />
        </label>
      </div>
      <div className="sale-add">
        <label className="search">
          <Search size={17} />
          <input
            aria-label="Buscar produto"
            placeholder="Buscar produto por nome, SKU ou código de barras…"
            value={productQuery}
            onChange={(e) => setProductQuery(e.target.value)}
          />
        </label>
        <div className="sale-product-results">
          {productOptions.isPending ? (
            <span className="muted">Buscando produtos…</span>
          ) : productOptions.error ? (
            <span className="error">{productOptions.error.message}</span>
          ) : productOptions.data?.products.length ? (
            productOptions.data.products.slice(0, 8).map((p) => (
              <button
                type="button"
                key={p.id}
                className="sale-product"
                onClick={() =>
                  setLines([
                    ...lines,
                    {
                      productId: p.id,
                      name: (p.sku ? "[" + p.sku + "] " : "") + p.name,
                      quantity: "1",
                      price: p.price,
                      discount: "",
                    },
                  ])
                }
              >
                <Plus size={14} />
                <span>{p.name}</span>
                <small>{money(p.price, sale?.currency ?? null)}</small>
              </button>
            ))
          ) : (
            <span className="muted">Nenhum produto à venda encontrado.</span>
          )}
        </div>
      </div>
      <div className="table-scroll">
        <table className="sale-lines">
          <thead>
            <tr>
              <th>Item</th>
              <th>Qtd.</th>
              <th>Preço unitário</th>
              <th>Desc. %</th>
              <th className="numeric">Subtotal</th>
              <th aria-label="Remover" />
            </tr>
          </thead>
          <tbody>
            {lines.length ? (
              lines.map((line, index) => (
                <tr key={index}>
                  <td>{line.name}</td>
                  <td>
                    <input
                      aria-label={"Quantidade de " + line.name}
                      inputMode="decimal"
                      value={line.quantity}
                      onChange={(e) =>
                        update(index, { quantity: e.target.value })
                      }
                    />
                  </td>
                  <td>
                    <input
                      aria-label={"Preço de " + line.name}
                      inputMode="decimal"
                      value={line.price}
                      onChange={(e) => update(index, { price: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      aria-label={"Desconto de " + line.name}
                      inputMode="decimal"
                      placeholder="0"
                      value={line.discount}
                      onChange={(e) =>
                        update(index, { discount: e.target.value })
                      }
                    />
                  </td>
                  <td className="numeric">
                    {Number.isFinite(lineSubtotal(line))
                      ? money(lineSubtotal(line), sale?.currency ?? null)
                      : "—"}
                  </td>
                  <td>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      aria-label={"Remover " + line.name}
                      onClick={() =>
                        setLines(lines.filter((_, i) => i !== index))
                      }
                    >
                      <Trash2 size={15} />
                    </Button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="muted">
                  Use a busca acima para incluir produtos.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {sale ? (
        <Totals sale={sale} />
      ) : (
        <p className="sale-estimate">
          Subtotal estimado:{" "}
          <strong>
            {Number.isFinite(estimate) ? money(estimate, null) : "—"}
          </strong>
          <span>Impostos e total final são calculados pelo Odoo.</span>
        </p>
      )}
      <label>
        Observações
        <textarea
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      {(problem || save.error) && (
        <p role="alert" className="error">
          {problem ?? save.error?.message}
        </p>
      )}
      <div className="form-actions">
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          disabled={pending}
        >
          Fechar
        </Button>
        <Button disabled={pending}>
          {save.isPending
            ? "Gravando no Odoo…"
            : sale
              ? "Salvar orçamento"
              : "Criar orçamento"}
        </Button>
      </div>
    </form>
  );
}
