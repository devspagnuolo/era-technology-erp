"use client";
import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, X } from "lucide-react";
import { api } from "../lib/session";
import { Button } from "./ui/button";
type Profile = { key: string; label: string; permissions: string[] };
type User = {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
};
type Branch = { id: string; name: string; code: string; active: boolean };
export function CorePanel({
  view,
  permissions,
  currentUserId,
}: {
  view: "users" | "branches" | "profiles";
  permissions: string[];
  currentUserId: string;
}) {
  const cache = useQueryClient();
  const [creating, setCreating] = useState(false);
  const branches = useQuery({
    queryKey: ["branches"],
    queryFn: () => api<Branch[]>("branches"),
    enabled: view === "branches",
  });
  const users = useQuery({
    queryKey: ["users"],
    queryFn: () => api<User[]>("users"),
    enabled: view === "users",
  });
  const profiles = useQuery({
    queryKey: ["profiles"],
    queryFn: () => api<Profile[]>("profiles"),
    enabled: permissions.includes("profiles:read"),
  });
  const changeStatus = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      api("users/" + id + "/status", {
        method: "PATCH",
        body: JSON.stringify({ active }),
      }),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ["users"] });
      void cache.invalidateQueries({ queryKey: ["audit"] });
    },
  });
  const changeBranchStatus = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      api("branches/" + id, {
        method: "PATCH",
        body: JSON.stringify({ active }),
      }),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ["branches"] });
      void cache.invalidateQueries({ queryKey: ["audit"] });
    },
  });
  const query =
    view === "branches" ? branches : view === "users" ? users : profiles;
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">ADMINISTRAÇÃO DA EMPRESA</p>
          <h1>
            {
              { branches: "Filiais", users: "Usuários", profiles: "Perfis" }[
                view
              ]
            }
          </h1>
          <p>
            {
              {
                branches: "Organize as unidades da sua operação.",
                users:
                  "Gerencie o acesso das pessoas ao ERP. Exibindo até 100 usuários.",
                profiles: "Permissões disponíveis em cada perfil predefinido.",
              }[view]
            }
          </p>
        </div>
        {view !== "profiles" && permissions.includes(view + ":create") && (
          <Button onClick={() => setCreating(true)}>
            <Plus size={16} />{" "}
            {view === "users" ? "Novo usuário" : "Nova filial"}
          </Button>
        )}
      </div>
      {(changeStatus.error || changeBranchStatus.error) && (
        <p role="alert" className="error">
          {changeStatus.error?.message || changeBranchStatus.error?.message}
        </p>
      )}
      <section className="table-card table-scroll">
        {query.isPending ? (
          <div className="empty">Carregando…</div>
        ) : query.error ? (
          <div role="alert" className="empty">
            {query.error.message}
          </div>
        ) : view === "branches" ? (
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Código</th>
                <th>Status</th>
                <th>Ação</th>
              </tr>
            </thead>
            <tbody>
              {branches.data?.map((b) => (
                <tr key={b.id}>
                  <td>{b.name}</td>
                  <td>{b.code}</td>
                  <td>{b.active ? "Ativo" : "Inativo"}</td>
                  <td>
                    {permissions.includes("branches:update") && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={changeBranchStatus.isPending}
                        onClick={() =>
                          changeBranchStatus.mutate({
                            id: b.id,
                            active: !b.active,
                          })
                        }
                      >
                        {b.active ? "Desativar" : "Reativar"}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : view === "users" ? (
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>E-mail</th>
                <th>Perfil</th>
                <th>Status</th>
                <th>Ação</th>
              </tr>
            </thead>
            <tbody>
              {users.data?.map((u) => (
                <tr key={u.id}>
                  <td>{u.name}</td>
                  <td>{u.email}</td>
                  <td>
                    {profiles.data?.find((p) => p.key === u.role)?.label ??
                      u.role}
                  </td>
                  <td>{u.active ? "Ativo" : "Inativo"}</td>
                  <td>
                    {permissions.includes("users:update") &&
                      u.id !== currentUserId && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={changeStatus.isPending}
                          onClick={() =>
                            changeStatus.mutate({ id: u.id, active: !u.active })
                          }
                        >
                          {u.active ? "Desativar" : "Reativar"}
                        </Button>
                      )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Perfil</th>
                <th>Permissões implementadas</th>
              </tr>
            </thead>
            <tbody>
              {profiles.data?.map((p) => (
                <tr key={p.key}>
                  <td>{p.label}</td>
                  <td
                    style={{
                      whiteSpace: "normal",
                      maxWidth: 600,
                      lineHeight: 1.8,
                    }}
                  >
                    {p.permissions.join(" · ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {query.data?.length === 0 && (
          <div className="empty">Nenhum registro cadastrado.</div>
        )}
      </section>
      {creating && view !== "profiles" && (
        <CoreForm
          kind={view}
          profiles={
            profiles.data?.filter((p) =>
              p.permissions.every((permission) =>
                permissions.includes(permission),
              ),
            ) ?? []
          }
          onClose={() => setCreating(false)}
        />
      )}
    </>
  );
}
const branchSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome"),
  code: z
    .string()
    .regex(/^[A-Za-z0-9_-]+$/, "Use letras, números, traço ou sublinhado"),
});
const userSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome"),
  email: z.string().email("E-mail inválido"),
  password: z.string().min(12, "Use pelo menos 12 caracteres").max(72),
  role: z.string().min(1, "Selecione o perfil"),
});
function CoreForm({
  kind,
  profiles,
  onClose,
}: {
  kind: "users" | "branches";
  profiles: Profile[];
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
  } = useForm({
    resolver: zodResolver(kind === "users" ? userSchema : branchSchema),
  });
  const mutation = useMutation({
    mutationFn: (data: unknown) =>
      api(kind, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: [kind] });
      void cache.invalidateQueries({ queryKey: ["audit"] });
      onClose();
    },
  });
  const fields =
    kind === "users"
      ? [
          { key: "name", label: "Nome", type: "text" },
          { key: "email", label: "E-mail", type: "email" },
          { key: "password", label: "Senha inicial", type: "password" },
        ]
      : [
          { key: "name", label: "Nome da filial", type: "text" },
          { key: "code", label: "Código", type: "text" },
        ];
  return (
    <dialog
      ref={dialog}
      className="modal"
      aria-labelledby="core-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!mutation.isPending) onClose();
      }}
    >
      <div className="modal-heading">
        <h2 id="core-title">
          {kind === "users" ? "Novo usuário" : "Nova filial"}
        </h2>
        <Button
          variant="outline"
          aria-label="Fechar"
          onClick={onClose}
          disabled={mutation.isPending}
        >
          <X size={16} />
        </Button>
      </div>
      <form onSubmit={handleSubmit((data) => mutation.mutate(data))}>
        {fields.map((field, index) => (
          <label key={field.key}>
            {field.label}
            <input
              {...register(field.key)}
              type={field.type}
              autoFocus={index === 0}
              autoComplete={field.key === "password" ? "new-password" : "off"}
            />
            {errors[field.key] && (
              <span className="error">
                {String(errors[field.key]?.message)}
              </span>
            )}
          </label>
        ))}
        {kind === "users" && (
          <label>
            Perfil
            <select {...register("role")} defaultValue="">
              <option value="" disabled>
                Selecione um perfil
              </option>
              {profiles.map((p) => (
                <option value={p.key} key={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
            {errors.role && (
              <span className="error">{String(errors.role.message)}</span>
            )}
          </label>
        )}
        {mutation.error && (
          <p className="error" role="alert">
            {mutation.error.message}
          </p>
        )}
        <div className="form-actions">
          <Button
            type="button"
            variant="outline"
            disabled={mutation.isPending}
            onClick={onClose}
          >
            Cancelar
          </Button>
          <Button disabled={mutation.isPending}>
            {mutation.isPending ? "Salvando…" : "Cadastrar"}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
