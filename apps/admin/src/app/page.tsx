"use client";
import { useState, useRef, useEffect } from "react";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Package,
  Search,
  Plus,
  ArrowUpRight,
  Building2,
  ShieldCheck,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Layers3,
  X,
} from "lucide-react";
import { api, useSession } from "../lib/session";
import { Button } from "../components/ui/button";
import { CorePanel } from "../components/core-panel";
type Product = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  salePrice: string;
  active: boolean;
};
type User = {
  id: string;
  name: string;
  permissions: string[];
  tenant: { name: string };
};
const schema = z.object({
  sku: z.string().trim().min(1, "Informe o SKU"),
  name: z.string().trim().min(2, "Informe o nome"),
  unit: z.string().min(1, "Informe a unidade"),
  salePrice: z.string().regex(/^\d{1,12}(\.\d{1,2})?$/, "Use o formato 100.00"),
});
type Input = z.infer<typeof schema>;
const money = (value: string) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    Number(value),
  );
export default function Page() {
  const generation = useSession((s) => s.generation);
  return <SessionWorkspace key={generation} />;
}
function SessionWorkspace() {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <Workspace />
    </QueryClientProvider>
  );
}
function Login() {
  const setSession = useSession((s) => s.setSession);
  const { register, handleSubmit } = useForm<{
    company: string;
    email: string;
    password: string;
  }>({ defaultValues: { company: "era-demo" } });
  const login = useMutation({
    mutationFn: (input: { company: string; email: string; password: string }) =>
      api<{ accessToken: string; refreshToken: string }>("auth/login", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: setSession,
  });
  return (
    <main className="login">
      <section className="login-story">
        <div className="brand">
          era<span>technology</span>
        </div>
        <p className="eyebrow">RETAIL & COMMERCE OS</p>
        <h1>
          Seu negócio.
          <br />
          Uma visão completa.
        </h1>
        <p>
          O núcleo operacional para conectar pessoas, produtos e resultados.
        </p>
        <div className="login-foot">
          <Layers3 size={20} /> Uma base para cada próximo passo.
        </div>
      </section>
      <section className="login-form">
        <form onSubmit={handleSubmit((data) => login.mutate(data))}>
          <div className="icon-tile">
            <Building2 />
          </div>
          <h2>Bem-vindo ao ERP</h2>
          <p>Acesse o ambiente da sua empresa.</p>
          <label>
            Empresa
            <input
              {...register("company", { required: true })}
              autoComplete="organization"
              required
            />
          </label>
          <label>
            E-mail
            <input
              type="email"
              {...register("email", { required: true })}
              autoComplete="username"
              required
            />
          </label>
          <label>
            Senha
            <input
              type="password"
              {...register("password", { required: true })}
              autoComplete="current-password"
              required
            />
          </label>
          {login.error && (
            <p role="alert" className="error">
              {login.error.message}
            </p>
          )}
          <Button className="w-full mt-3" disabled={login.isPending}>
            {login.isPending ? "Entrando…" : "Acessar empresa"}
            <ArrowUpRight size={16} />
          </Button>
          <small>
            <ShieldCheck size={14} /> Acesso seguro ao ambiente da sua empresa
          </small>
        </form>
      </section>
    </main>
  );
}
function Workspace() {
  const session = useSession((s) => s.session);
  if (!session) return <Login />;
  return <Catalog />;
}
function Catalog() {
  const cache = useQueryClient();
  const setSession = useSession((s) => s.setSession);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Product | "new" | null>(null);
  const [view, setView] = useState<
    "products" | "audit" | "users" | "branches" | "profiles"
  >("products");
  const user = useQuery({
    queryKey: ["me"],
    queryFn: () => api<User>("auth/me"),
  });
  const products = useQuery({
    queryKey: ["products", q, page],
    queryFn: () =>
      api<{ items: Product[]; total: number; pageSize: number }>(
        "products?q=" + encodeURIComponent(q) + "&page=" + page,
      ),
    enabled: !!user.data?.permissions.includes("products:read"),
  });
  const audits = useQuery({
    queryKey: ["audit"],
    queryFn: () =>
      api<
        Array<{
          id: string;
          createdAt: string;
          module: string;
          action: string;
          actorId: string;
          recordId: string;
        }>
      >("audit"),
    enabled:
      view === "audit" && !!user.data?.permissions.includes("audit:read"),
  });
  const canUpdate = !!user.data?.permissions.includes("products:update");
  const toggle = useMutation({
    mutationFn: (product: Product) =>
      api("products/" + product.id, {
        method: "PATCH",
        body: JSON.stringify({ active: !product.active }),
      }),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ["products"] });
      void cache.invalidateQueries({ queryKey: ["audit"] });
    },
  });
  const logout = useMutation({
    mutationFn: () => api("auth/logout", { method: "POST" }),
    onSuccess: () => {
      cache.clear();
      setSession(null);
    },
  });
  return (
    <div className="shell">
      <aside>
        <div className="brand">
          era<span>technology</span>
        </div>
        <div className="workspace-label">
          WORKSPACE <span>ERP</span>
        </div>
        <p className="nav-label">OPERAÇÃO</p>
        <button
          className={view === "products" ? "nav active" : "nav"}
          onClick={() => setView("products")}
        >
          <Package size={19} /> Produtos <span className="nav-dot" />
        </button>
        {user.data?.permissions.includes("audit:read") && (
          <>
            <p className="nav-label">ADMINISTRAÇÃO</p>
            <button
              className={view === "audit" ? "nav active" : "nav"}
              onClick={() => setView("audit")}
            >
              <ShieldCheck size={19} /> Auditoria
            </button>
          </>
        )}
        {(
          [
            { key: "branches", label: "Filiais", permission: "core:read" },
            { key: "users", label: "Usuários", permission: "users:read" },
            { key: "profiles", label: "Perfis", permission: "profiles:read" },
          ] as const
        )
          .filter((item) => user.data?.permissions.includes(item.permission))
          .map((item) => (
            <button
              key={item.key}
              className={view === item.key ? "nav active" : "nav"}
              onClick={() => setView(item.key)}
            >
              <Building2 size={19} />
              {item.label}
            </button>
          ))}
        <div className="sidebar-bottom">
          <div className="avatar">{user.data?.name?.slice(0, 1) || "E"}</div>
          <div>
            <strong>{user.data?.name || "Carregando…"}</strong>
            <small>{user.data?.tenant.name}</small>
          </div>
          <button
            aria-label="Sair"
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
          >
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      <div className="main">
        <header>
          <div>
            Workspace <span>/</span>{" "}
            {view === "products" ? "Cadastros" : "Administração"}
          </div>
          <div className="company">
            <Building2 size={16} />
            {user.data?.tenant.name || "Empresa"}
          </div>
        </header>
        <main className="content">
          {(user.error || logout.error) && (
            <p role="alert" className="error">
              {user.error?.message || logout.error?.message}
            </p>
          )}
          {view === "users" || view === "branches" || view === "profiles" ? (
            <CorePanel
              key={view}
              view={view}
              permissions={user.data?.permissions ?? []}
              currentUserId={user.data?.id ?? ""}
            />
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <p className="eyebrow">
                    {view === "products"
                      ? "CATÁLOGO DA EMPRESA"
                      : "CONTROLE E RASTREABILIDADE"}
                  </p>
                  <h1>{view === "products" ? "Produtos" : "Auditoria"}</h1>
                  <p>
                    {view === "products"
                      ? "Organize os produtos que movimentam o seu negócio."
                      : "Acompanhe as últimas 100 operações registradas na empresa."}
                  </p>
                </div>
                {view === "products" &&
                  user.data?.permissions.includes("products:create") && (
                    <Button onClick={() => setEditing("new")}>
                      <Plus size={17} /> Novo produto
                    </Button>
                  )}
              </div>
              {view === "products" ? (
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
                      Seu catálogo, sempre conectado.
                      <br />
                      <span>Consulte e cadastre produtos em um só lugar.</span>
                    </p>
                  </div>
                  <section className="table-card">
                    <div className="table-toolbar">
                      <h2>Catálogo de produtos</h2>
                      <label className="search">
                        <Search size={17} />
                        <input
                          aria-label="Buscar produtos"
                          placeholder="Buscar por nome ou SKU…"
                          value={q}
                          onChange={(e) => {
                            setQ(e.target.value);
                            setPage(1);
                          }}
                        />
                      </label>
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
                        <Button
                          variant="outline"
                          onClick={() => products.refetch()}
                        >
                          Tentar novamente
                        </Button>
                      </div>
                    ) : !user.data?.permissions.includes("products:read") &&
                      !user.isPending ? (
                      <div className="empty">
                        Seu perfil não permite consultar produtos.
                      </div>
                    ) : products.isPending ? (
                      <div className="empty">Carregando catálogo…</div>
                    ) : products.data?.items.length ? (
                      <>
                        <div className="table-scroll">
                          <table>
                            <thead>
                              <tr>
                                <th>Produto</th>
                                <th>SKU</th>
                                <th>Unidade</th>
                                <th>Preço de venda</th>
                                <th>Status</th>
                                {canUpdate && <th>Ações</th>}
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
                                  <td className="mono">{p.sku}</td>
                                  <td>{p.unit}</td>
                                  <td>{money(p.salePrice)}</td>
                                  <td>
                                    <span className="badge">
                                      {p.active ? "Ativo" : "Inativo"}
                                    </span>
                                  </td>
                                  {canUpdate && (
                                    <td>
                                      <div className="row-actions">
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
                                          {p.active ? "Inativar" : "Reativar"}
                                        </Button>
                                      </div>
                                    </td>
                                  )}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <footer className="table-footer">
                          <span>
                            {products.data.total} produtos encontrados
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
                              disabled={page * 20 >= products.data.total}
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
                          {q
                            ? "Nenhum resultado encontrado"
                            : "Seu catálogo começa aqui"}
                        </h3>
                        <p>
                          {q
                            ? "Tente buscar por outro nome ou SKU."
                            : "Cadastre o primeiro produto da sua empresa."}
                        </p>
                      </div>
                    )}
                  </section>
                  <p className="data-note">
                    <ShieldCheck size={14} /> Dados exclusivos da empresa
                    selecionada. Cadastros geram registro de auditoria.
                  </p>
                </>
              ) : (
                <section className="table-card table-scroll">
                  {audits.isPending ? (
                    <div className="empty">Carregando registros…</div>
                  ) : audits.error ? (
                    <p className="error" role="alert">
                      {audits.error.message}
                    </p>
                  ) : (
                    <table>
                      <thead>
                        <tr>
                          <th>Data</th>
                          <th>Módulo</th>
                          <th>Ação</th>
                          <th>Usuário</th>
                        </tr>
                      </thead>
                      <tbody>
                        {audits.data?.map((a) => (
                          <tr key={a.id}>
                            <td>
                              {new Date(a.createdAt).toLocaleString("pt-BR")}
                            </td>
                            <td>{a.module}</td>
                            <td>{a.action}</td>
                            <td className="mono">{a.actorId}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {audits.data?.length === 0 && (
                    <div className="empty">Nenhuma operação registrada.</div>
                  )}
                </section>
              )}
            </>
          )}
        </main>
      </div>
      {editing && (
        <ProductForm
          product={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
function ProductForm({
  product,
  onClose,
}: {
  product?: Product;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const cache = useQueryClient();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Input>({
    resolver: zodResolver(schema),
    defaultValues: product
      ? {
          sku: product.sku,
          name: product.name,
          unit: product.unit,
          salePrice: Number(product.salePrice).toFixed(2),
        }
      : { unit: "UN", salePrice: "0.00" },
  });
  const create = useMutation({
    mutationFn: (input: Input) =>
      product
        ? api("products/" + product.id, {
            method: "PATCH",
            body: JSON.stringify(input),
          })
        : api("products", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ["products"] });
      void cache.invalidateQueries({ queryKey: ["audit"] });
      onClose();
    },
  });
  return (
    <dialog
      ref={dialog}
      className="modal"
      aria-labelledby="product-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!create.isPending) onClose();
      }}
    >
      <div className="modal-heading">
        <div>
          <p className="eyebrow">CATÁLOGO</p>
          <h2 id="product-title">
            {product ? "Editar produto" : "Novo produto"}
          </h2>
        </div>
        <Button
          variant="outline"
          aria-label="Fechar"
          onClick={onClose}
          disabled={create.isPending}
        >
          <X size={17} />
        </Button>
      </div>
      <form onSubmit={handleSubmit((input) => create.mutate(input))}>
        {(["name", "sku", "unit", "salePrice"] as const).map((field) => (
          <label key={field}>
            {
              {
                name: "Nome do produto",
                sku: "SKU",
                unit: "Unidade",
                salePrice: "Preço de venda (R$)",
              }[field]
            }
            <input
              {...register(field)}
              autoFocus={field === "name"}
              aria-invalid={!!errors[field]}
              inputMode={field === "salePrice" ? "decimal" : "text"}
            />
            {errors[field] && (
              <span className="error">{errors[field]?.message}</span>
            )}
          </label>
        ))}
        {create.error && (
          <p role="alert" className="error">
            {create.error.message}
          </p>
        )}
        <div className="form-actions">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={create.isPending}
          >
            Cancelar
          </Button>
          <Button disabled={create.isPending}>
            {create.isPending
              ? "Salvando…"
              : product
                ? "Salvar alterações"
                : "Cadastrar produto"}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
