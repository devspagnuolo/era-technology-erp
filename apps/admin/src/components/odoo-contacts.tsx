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
  ContactRound,
  Plus,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { api } from "../lib/session";
import { Button } from "./ui/button";
import { OdooUnavailable, useOdooStatus } from "./odoo-status";

export type OdooContact = {
  id: number;
  name: string;
  kind: "person" | "company";
  document: string | null;
  email: string | null;
  phone: string | null;
  street: string | null;
  city: string | null;
  zip: string | null;
  customer: boolean;
  supplier: boolean;
  active: boolean;
};
type Page = {
  items: OdooContact[];
  total: number;
  pageSize: number;
  roles: boolean;
};
const schema = z.object({
  name: z.string().trim().min(2, "Informe o nome"),
  kind: z.enum(["company", "person"]),
  document: z.string().trim(),
  email: z
    .string()
    .trim()
    .refine((v) => !v || z.string().email().safeParse(v).success, {
      message: "E-mail inválido",
    }),
  phone: z.string().trim(),
  street: z.string().trim(),
  city: z.string().trim(),
  zip: z.string().trim(),
  customer: z.boolean(),
  supplier: z.boolean(),
});
type Input = z.infer<typeof schema>;
const roleLabel = (c: OdooContact) =>
  [c.customer && "Cliente", c.supplier && "Fornecedor"]
    .filter(Boolean)
    .join(" · ") || "—";

export function OdooContacts({
  permissions,
  odooUrl,
}: {
  permissions: string[];
  odooUrl: string;
}) {
  const cache = useQueryClient();
  const [q, setQ] = useState("");
  const [role, setRole] = useState<"all" | "customer" | "supplier">("all");
  const [status, setStatus] = useState<"active" | "archived" | "all">("active");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<OdooContact | "new" | null>(null);
  const canCreate = permissions.includes("contacts:create");
  const canUpdate = permissions.includes("contacts:update");
  const { status: integration, ready } = useOdooStatus();
  const contacts = useQuery({
    queryKey: ["odoo-contacts", q, role, status, page],
    queryFn: () =>
      api<Page>(
        "odoo/contacts?" +
          new URLSearchParams({
            q,
            role,
            status,
            page: String(page),
          }).toString(),
      ),
    enabled: ready,
  });
  const toggle = useMutation({
    mutationFn: (contact: OdooContact) =>
      api("odoo/contacts/" + contact.id, {
        method: "PATCH",
        body: JSON.stringify({ active: !contact.active }),
      }),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ["odoo-contacts"] });
      void cache.invalidateQueries({ queryKey: ["audit"] });
    },
  });
  const pageSize = contacts.data?.pageSize ?? 20;
  const roles = contacts.data?.roles ?? true;
  const filtered = !!q || role !== "all" || status !== "active";
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">RELACIONAMENTO · DADOS DO ODOO</p>
          <h1>Clientes e fornecedores</h1>
          <p>
            Cadastre e consulte contatos aqui. Tudo é gravado diretamente no
            Odoo, que continua sendo a fonte oficial.
          </p>
        </div>
        {ready && canCreate && (
          <Button onClick={() => setEditing("new")}>
            <Plus size={17} /> Novo contato
          </Button>
        )}
      </div>
      {!ready ? (
        <OdooUnavailable
          status={integration}
          icon={<ContactRound size={24} />}
        />
      ) : (
        <>
          <section className="table-card">
            <div className="table-toolbar">
              <h2>Contatos</h2>
              <div className="toolbar-filters">
                {roles && (
                  <select
                    aria-label="Tipo de contato"
                    value={role}
                    onChange={(e) => {
                      setRole(e.target.value as typeof role);
                      setPage(1);
                    }}
                  >
                    <option value="all">Todos</option>
                    <option value="customer">Clientes</option>
                    <option value="supplier">Fornecedores</option>
                  </select>
                )}
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
                    aria-label="Buscar contatos"
                    placeholder="Buscar por nome, CPF/CNPJ, e-mail ou telefone…"
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
            {contacts.error ? (
              <div className="empty" role="alert">
                <h3>Não foi possível carregar os contatos</h3>
                <p>{contacts.error.message}</p>
                <Button variant="outline" onClick={() => contacts.refetch()}>
                  Tentar novamente
                </Button>
              </div>
            ) : contacts.isPending ? (
              <div className="empty">Buscando contatos no Odoo…</div>
            ) : contacts.data.items.length ? (
              <>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Nome</th>
                        <th>CPF/CNPJ</th>
                        {roles && <th>Tipo</th>}
                        <th>E-mail</th>
                        <th>Telefone</th>
                        <th>Cidade</th>
                        <th>Situação</th>
                        <th>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contacts.data.items.map((c) => (
                        <tr key={c.id}>
                          <td>
                            <div className="product-name">
                              <span>
                                <ContactRound size={18} />
                              </span>
                              <strong>{c.name}</strong>
                            </div>
                          </td>
                          <td className="mono">{c.document ?? "—"}</td>
                          {roles && <td>{roleLabel(c)}</td>}
                          <td>{c.email ?? "—"}</td>
                          <td>{c.phone ?? "—"}</td>
                          <td>{c.city ?? "—"}</td>
                          <td>
                            <span className="badge">
                              {c.active ? "Ativo" : "Arquivado"}
                            </span>
                          </td>
                          <td>
                            <div className="row-actions">
                              {canUpdate && (
                                <>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setEditing(c)}
                                  >
                                    Editar
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={toggle.isPending}
                                    onClick={() => toggle.mutate(c)}
                                  >
                                    {c.active ? "Arquivar" : "Restaurar"}
                                  </Button>
                                </>
                              )}
                              <a
                                className="row-link"
                                aria-label={"Abrir " + c.name + " no Odoo"}
                                href={
                                  odooUrl +
                                  "/action-base.action_partner_form/" +
                                  c.id
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
                  <span>{contacts.data.total} contatos encontrados</span>
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
                      disabled={page * pageSize >= contacts.data.total}
                      onClick={() => setPage(page + 1)}
                    >
                      <ChevronRight size={16} />
                    </Button>
                  </div>
                </footer>
              </>
            ) : (
              <div className="empty">
                <ContactRound size={32} />
                <h3>
                  {filtered
                    ? "Nenhum resultado encontrado"
                    : "Nenhum contato cadastrado"}
                </h3>
                <p>
                  {filtered
                    ? "Tente outra busca ou filtro."
                    : "Cadastre o primeiro cliente ou fornecedor; ele será criado no Odoo."}
                </p>
              </div>
            )}
          </section>
          <p className="data-note">
            <ShieldCheck size={14} /> Somente contatos da empresa vinculada.
            Cada alteração fica registrada na auditoria ERA.
          </p>
        </>
      )}
      {editing && (
        <ContactDialog
          contact={editing === "new" ? undefined : editing}
          roles={roles}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function ContactDialog({
  contact,
  roles,
  onClose,
}: {
  contact?: OdooContact;
  roles: boolean;
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
    formState: { errors, dirtyFields },
  } = useForm<Input>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: contact?.name ?? "",
      kind: contact?.kind ?? "company",
      document: contact?.document ?? "",
      email: contact?.email ?? "",
      phone: contact?.phone ?? "",
      street: contact?.street ?? "",
      city: contact?.city ?? "",
      zip: contact?.zip ?? "",
      customer: contact ? contact.customer : true,
      supplier: contact ? contact.supplier : false,
    },
  });
  const save = useMutation({
    mutationFn: (input: Input) => {
      const body: Record<string, unknown> = {
        ...input,
        document: input.document || null,
        email: input.email || null,
        phone: input.phone || null,
        street: input.street || null,
        city: input.city || null,
        zip: input.zip || null,
      };
      if (!roles) {
        delete body.customer;
        delete body.supplier;
      }
      if (!contact)
        return api("odoo/contacts", {
          method: "POST",
          body: JSON.stringify(body),
        });
      // Na edição, envia apenas o que mudou para não sobrescrever o Odoo.
      const changed = Object.fromEntries(
        Object.entries(body).filter(([key]) => dirtyFields[key as keyof Input]),
      );
      return api("odoo/contacts/" + contact.id, {
        method: "PATCH",
        body: JSON.stringify(changed),
      });
    },
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ["odoo-contacts"] });
      void cache.invalidateQueries({ queryKey: ["audit"] });
      onClose();
    },
  });
  const field = (name: keyof Input, label: string, type = "text") => (
    <label>
      {label}
      <input
        {...register(name)}
        type={type}
        autoFocus={name === "name"}
        aria-invalid={!!errors[name]}
      />
      {errors[name] && <span className="error">{errors[name]?.message}</span>}
    </label>
  );
  return (
    <dialog
      ref={dialog}
      className="modal"
      aria-labelledby="contact-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!save.isPending) onClose();
      }}
    >
      <div className="modal-heading">
        <div>
          <p className="eyebrow">CONTATOS · ODOO</p>
          <h2 id="contact-title">
            {contact ? "Editar contato" : "Novo contato"}
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
          if (contact && !Object.keys(dirtyFields).length) return onClose();
          save.mutate(input);
        })}
      >
        {field("name", "Nome ou razão social")}
        <div className="form-grid">
          <label>
            Pessoa
            <select {...register("kind")}>
              <option value="company">Jurídica (empresa)</option>
              <option value="person">Física</option>
            </select>
          </label>
          {field("document", "CPF/CNPJ")}
          {field("email", "E-mail", "email")}
          {field("phone", "Telefone", "tel")}
          {field("street", "Endereço")}
          {field("city", "Cidade")}
          {field("zip", "CEP")}
          {roles && (
            <div className="checkbox-group">
              <label className="checkbox">
                <input type="checkbox" {...register("customer")} />
                Cliente
              </label>
              <label className="checkbox">
                <input type="checkbox" {...register("supplier")} />
                Fornecedor
              </label>
            </div>
          )}
        </div>
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
              : contact
                ? "Salvar alterações"
                : "Cadastrar contato"}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
