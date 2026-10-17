"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Package,
  Plus,
  Search,
  ShieldCheck,
} from "lucide-react";
import { api } from "../lib/session";
import { Button } from "./ui/button";
import { OdooUnavailable, useOdooStatus } from "./odoo-status";
import { OdooRecordDialog } from "./odoo-record-dialog";

type Ref = { id: number; name: string } | null;
export type OdooProduct = {
  id: number;
  name: string;
  sku: string;
  barcode: string | null;
  salePrice: string;
  cost: string;
  category: Ref;
  uom: Ref;
  type: "consu" | "service" | "combo";
  tracksStock: boolean;
  quantity: number | null;
  active: boolean;
};
const money = (value: string) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    Number(value),
  );
const quantity = (value: number) =>
  new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(value);

export function OdooProducts({
  permissions,
  odooUrl,
}: {
  permissions: string[];
  odooUrl: string;
}) {
  const cache = useQueryClient();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"active" | "archived" | "all">("active");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<OdooProduct | "new" | null>(null);
  const canCreate = permissions.includes("products:create");
  const canUpdate = permissions.includes("products:update");
  const { status: integration, ready } = useOdooStatus();
  const products = useQuery({
    queryKey: ["odoo-products", q, status, page],
    queryFn: () =>
      api<{ items: OdooProduct[]; total: number; pageSize: number }>(
        "odoo/products?" +
          new URLSearchParams({ q, status, page: String(page) }).toString(),
      ),
    enabled: ready,
  });
  const toggle = useMutation({
    mutationFn: (product: OdooProduct) =>
      api("odoo/products/" + product.id, {
        method: "PATCH",
        body: JSON.stringify({ active: !product.active }),
      }),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ["odoo-products"] });
      void cache.invalidateQueries({ queryKey: ["audit"] });
    },
  });
  const pageSize = products.data?.pageSize ?? 20;
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">CATÁLOGO · DADOS DO ODOO</p>
          <h1>Produtos</h1>
          <p>
            Consulte e cadastre produtos aqui. Tudo é gravado diretamente no
            Odoo, que continua sendo a fonte oficial.
          </p>
        </div>
        {ready && canCreate && (
          <Button onClick={() => setEditing("new")}>
            <Plus size={17} /> Novo produto
          </Button>
        )}
      </div>
      {!ready ? (
        <OdooUnavailable status={integration} icon={<Package size={24} />} />
      ) : (
        <>
          <div className="catalog-summary">
            <div className="icon-tile">
              <Package size={23} />
            </div>
            <div>
              <small>PRODUTOS ENCONTRADOS</small>
              <strong>{products.data?.total ?? "—"}</strong>
            </div>
            <p>
              Conectado ao Odoo {integration.data?.version}
              <br />
              <span>Alterações aparecem no Odoo imediatamente.</span>
            </p>
          </div>
          <section className="table-card">
            <div className="table-toolbar">
              <h2>Catálogo de produtos</h2>
              <div className="toolbar-filters">
                <select
                  aria-label="Situação"
                  value={status}
                  onChange={(e) => {
                    setStatus(e.target.value as typeof status);
                    setPage(1);
                  }}
                >
                  <option value="active">Ativos</option>
                  <option value="archived">Arquivados</option>
                  <option value="all">Todos</option>
                </select>
                <label className="search">
                  <Search size={17} />
                  <input
                    aria-label="Buscar produtos"
                    placeholder="Buscar por nome, SKU ou código de barras…"
                    value={q}
                    onChange={(e) => {
                      setQ(e.target.value);
                      setPage(1);
                    }}
                  />
                </label>
              </div>
            </div>
            {toggle.error && (
              <p role="alert" className="error">
                {toggle.error.message}
              </p>
            )}
            {products.error ? (
              <div className="empty" role="alert">
                <h3>Não foi possível carregar o catálogo</h3>
                <p>{products.error.message}</p>
                <Button variant="outline" onClick={() => products.refetch()}>
                  Tentar novamente
                </Button>
              </div>
            ) : products.isPending ? (
              <div className="empty">Buscando produtos no Odoo…</div>
            ) : products.data.items.length ? (
              <>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Produto</th>
                        <th>SKU</th>
                        <th>Categoria</th>
                        <th>Unidade</th>
                        <th>Preço de venda</th>
                        <th>Estoque</th>
                        <th>Situação</th>
                        <th>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {products.data.items.map((p) => (
                        <tr key={p.id}>
                          <td>
                            <div className="product-name">
                              <span>
                                <Package size={18} />
                              </span>
                              <strong>{p.name}</strong>
                            </div>
                          </td>
                          <td className="mono">{p.sku || "—"}</td>
                          <td>{p.category?.name ?? "—"}</td>
                          <td>{p.uom?.name ?? "—"}</td>
                          <td>{money(p.salePrice)}</td>
                          <td>
                            {p.tracksStock && p.quantity !== null
                              ? quantity(p.quantity)
                              : "—"}
                          </td>
                          <td>
                            <span className="badge">
                              {p.active ? "Ativo" : "Arquivado"}
                            </span>
                          </td>
                          <td>
                            <div className="row-actions">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setEditing(p)}
                              >
                                {canUpdate ? "Editar" : "Abrir"}
                              </Button>
                              {canUpdate && (
                                <>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={toggle.isPending}
                                    onClick={() => toggle.mutate(p)}
                                  >
                                    {p.active ? "Arquivar" : "Restaurar"}
                                  </Button>
                                </>
                              )}
                              <a
                                className="row-link"
                                aria-label={"Abrir " + p.name + " no Odoo"}
                                href={
                                  odooUrl +
                                  "/action-stock.product_template_action_product/" +
                                  p.id
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
                  <span>{products.data.total} produtos encontrados</span>
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
                      disabled={page * pageSize >= products.data.total}
                      onClick={() => setPage(page + 1)}
                    >
                      <ChevronRight size={16} />
                    </Button>
                  </div>
                </footer>
              </>
            ) : (
              <div className="empty">
                <Package size={32} />
                <h3>
                  {q || status !== "active"
                    ? "Nenhum resultado encontrado"
                    : "Seu catálogo começa aqui"}
                </h3>
                <p>
                  {q || status !== "active"
                    ? "Tente outra busca ou situação."
                    : "Cadastre o primeiro produto; ele será criado no Odoo."}
                </p>
              </div>
            )}
          </section>
          <p className="data-note">
            <ShieldCheck size={14} /> Somente produtos da empresa vinculada.
            Cada alteração fica registrada na auditoria ERA.
          </p>
        </>
      )}
      {editing && (
        <OdooRecordDialog
          endpoint="odoo/products"
          recordId={editing === "new" ? undefined : editing.id}
          eyebrow="PRODUTOS · ODOO"
          title={(form) =>
            editing === "new"
              ? "Novo produto"
              : String(form?.values.name ?? editing.name)
          }
          canEdit={editing === "new" ? canCreate : canUpdate}
          invalidate={["odoo-products"]}
          createLabel="Cadastrar produto"
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

