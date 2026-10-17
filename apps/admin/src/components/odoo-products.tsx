"use client";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Package,
  Plus,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { api } from "../lib/session";
import { Button } from "./ui/button";

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
type Status = {
  configured: boolean;
  connected: boolean;
  linked: boolean;
  version?: string;
};
type Options = {
  categories: Array<{ id: number; name: string }>;
  uoms: Array<{ id: number; name: string }>;
};
const decimal = /^\d{1,12}(\.\d{1,2})?$/;
const schema = z.object({
  name: z.string().trim().min(2, "Informe o nome"),
  sku: z.string().trim().min(1, "Informe o código (SKU)"),
  barcode: z.string().trim(),
  salePrice: z.string().regex(decimal, "Use o formato 100.00"),
  cost: z.string().regex(decimal, "Use o formato 100.00"),
  categoryId: z.string(),
  uomId: z.string(),
  type: z.enum(["consu", "service"]),
  tracksStock: z.boolean(),
});
type Input = z.infer<typeof schema>;
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
  const integration = useQuery({
    queryKey: ["odoo-status"],
    queryFn: () => api<Status>("odoo/status"),
  });
  const ready = !!integration.data?.connected && !!integration.data.linked;
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
      {integration.isPending ? (
        <div className="empty">Conectando ao Odoo…</div>
      ) : !ready ? (
        <section className="era-odoo-handoff" role="status">
          <div className="era-handoff-icon">
            <Package size={24} />
          </div>
          <span className="era-eyebrow">INTEGRAÇÃO ODOO</span>
          <h1>
            {integration.error
              ? "Não foi possível verificar a integração"
              : !integration.data?.configured
                ? "Integração ainda não configurada"
                : !integration.data.linked
                  ? "Empresa sem vínculo no Odoo"
                  : "Odoo indisponível no momento"}
          </h1>
          <p>
            {integration.error?.message ??
              (!integration.data?.configured
                ? "O administrador precisa informar o endereço do Odoo e a chave do usuário de integração na API ERA."
                : !integration.data.linked
                  ? "Esta empresa ERA ainda não foi associada a uma empresa do Odoo pelo administrador."
                  : "Tente novamente em instantes. Se o Odoo estiver hibernando, a primeira resposta pode demorar.")}
          </p>
          <Button variant="outline" onClick={() => integration.refetch()}>
            Tentar novamente
          </Button>
        </section>
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
                              {canUpdate && (
                                <>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setEditing(p)}
                                  >
                                    Editar
                                  </Button>
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
        <ProductDialog
          product={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function ProductDialog({
  product,
  onClose,
}: {
  product?: OdooProduct;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const cache = useQueryClient();
  const options = useQuery({
    queryKey: ["odoo-product-options"],
    queryFn: () => api<Options>("odoo/products/options"),
    staleTime: 5 * 60_000,
  });
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, dirtyFields },
  } = useForm<Input>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: product?.name ?? "",
      sku: product?.sku ?? "",
      barcode: product?.barcode ?? "",
      salePrice: product?.salePrice ?? "0.00",
      cost: product?.cost ?? "0.00",
      categoryId: String(product?.category?.id ?? ""),
      uomId: String(product?.uom?.id ?? ""),
      type: product?.type === "service" ? "service" : "consu",
      tracksStock: product ? product.tracksStock : true,
    },
  });
  const save = useMutation({
    mutationFn: (input: Input) => {
      const body: Record<string, unknown> = {
        name: input.name,
        sku: input.sku,
        barcode: input.barcode || null,
        salePrice: input.salePrice,
        cost: input.cost,
        categoryId: input.categoryId ? Number(input.categoryId) : undefined,
        uomId: input.uomId ? Number(input.uomId) : undefined,
        type: input.type,
        tracksStock: input.type === "consu" && input.tracksStock,
      };
      if (!product)
        return api("odoo/products", {
          method: "POST",
          body: JSON.stringify(body),
        });
      // Na edição, envia apenas o que mudou para não sobrescrever o Odoo.
      const changed = Object.fromEntries(
        Object.entries(body).filter(
          ([key]) =>
            dirtyFields[key as keyof Input] ||
            (key === "tracksStock" && dirtyFields.type),
        ),
      );
      return api("odoo/products/" + product.id, {
        method: "PATCH",
        body: JSON.stringify(changed),
      });
    },
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ["odoo-products"] });
      void cache.invalidateQueries({ queryKey: ["audit"] });
      onClose();
    },
  });
  const type = watch("type");
  const field = (name: keyof Input, label: string, decimalInput = false) => (
    <label>
      {label}
      <input
        {...register(name)}
        autoFocus={name === "name"}
        aria-invalid={!!errors[name]}
        inputMode={decimalInput ? "decimal" : "text"}
      />
      {errors[name] && <span className="error">{errors[name]?.message}</span>}
    </label>
  );
  return (
    <dialog
      ref={dialog}
      className="modal"
      aria-labelledby="product-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!save.isPending) onClose();
      }}
    >
      <div className="modal-heading">
        <div>
          <p className="eyebrow">CATÁLOGO · ODOO</p>
          <h2 id="product-title">
            {product ? "Editar produto" : "Novo produto"}
          </h2>
        </div>
        <Button
          variant="outline"
          aria-label="Fechar"
          onClick={onClose}
          disabled={save.isPending}
        >
          <X size={17} />
        </Button>
      </div>
      <form
        onSubmit={handleSubmit((input) => {
          if (product && !Object.keys(dirtyFields).length) return onClose();
          save.mutate(input);
        })}
      >
        {field("name", "Nome do produto")}
        <div className="form-grid">
          {field("sku", "Código (SKU)")}
          {field("barcode", "Código de barras")}
          {field("salePrice", "Preço de venda (R$)", true)}
          {field("cost", "Custo (R$)", true)}
          <label>
            Categoria
            <select {...register("categoryId")} disabled={options.isPending}>
              <option value="">Padrão do Odoo</option>
              {options.data?.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Unidade
            <select {...register("uomId")} disabled={options.isPending}>
              <option value="">Padrão do Odoo</option>
              {options.data?.uoms.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Tipo
            <select {...register("type")}>
              <option value="consu">Produto (mercadoria)</option>
              <option value="service">Serviço</option>
            </select>
          </label>
          {type === "consu" && (
            <label className="checkbox">
              <input type="checkbox" {...register("tracksStock")} />
              Controlar estoque
            </label>
          )}
        </div>
        {options.error && (
          <p role="alert" className="error">
            {options.error.message}
          </p>
        )}
        {save.error && (
          <p role="alert" className="error">
            {save.error.message}
          </p>
        )}
        <div className="form-actions">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={save.isPending}
          >
            Cancelar
          </Button>
          <Button disabled={save.isPending}>
            {save.isPending
              ? "Gravando no Odoo…"
              : product
                ? "Salvar alterações"
                : "Cadastrar produto"}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
