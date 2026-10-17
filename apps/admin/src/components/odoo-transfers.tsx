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
  Warehouse,
} from "lucide-react";
import { api } from "../lib/session";
import { Button } from "./ui/button";
import { OdooUnavailable, useOdooStatus } from "./odoo-status";
import { OdooRecordDialog } from "./odoo-record-dialog";

type Kind = "incoming" | "outgoing" | "internal";
type Stage = "draft" | "waiting" | "ready" | "done" | "cancelled";
type Ref = { id: number; name: string } | null;
export type OdooTransfer = {
  id: number;
  number: string;
  partner: Ref;
  operation: Ref;
  kind: Kind;
  stage: Stage;
  state: string;
  scheduled: string;
  done: string | null;
  origin: string | null;
};
type Page = { items: OdooTransfer[]; total: number; pageSize: number };

const kinds: Record<Kind, { tab: string; one: string; partner: string }> = {
  incoming: { tab: "Recebimentos", one: "Recebimento", partner: "Fornecedor" },
  outgoing: { tab: "Entregas", one: "Entrega", partner: "Cliente" },
  internal: {
    tab: "Internas",
    one: "Transferência interna",
    partner: "Contato",
  },
};
const stageLabel: Record<Stage, string> = {
  draft: "Rascunho",
  waiting: "Aguardando",
  ready: "Pronto",
  done: "Concluído",
  cancelled: "Cancelado",
};
// O Odoo devolve datas em UTC no formato "AAAA-MM-DD HH:MM:SS".
const dateLabel = (value: string) =>
  new Date(value.replace(" ", "T") + "Z").toLocaleDateString("pt-BR");

export function OdooTransfers({
  permissions,
  odooUrl,
}: {
  permissions: string[];
  odooUrl: string;
}) {
  const [kind, setKind] = useState<Kind>("incoming");
  const [q, setQ] = useState("");
  const [stage, setStage] = useState<"open" | "all" | Stage>("open");
  const [page, setPage] = useState(1);
  const [opened, setOpened] = useState<number | "new" | null>(null);
  const canCreate = permissions.includes("inventory:create");
  const { status: integration, ready } = useOdooStatus();
  const transfers = useQuery({
    queryKey: ["odoo-inventory", kind, q, stage, page],
    queryFn: () =>
      api<Page>(
        "odoo/transfers?" +
          new URLSearchParams({
            kind,
            q,
            stage,
            page: String(page),
          }).toString(),
      ),
    enabled: ready,
  });
  const pageSize = transfers.data?.pageSize ?? 20;
  const filtered = !!q || stage !== "open";
  const label = kinds[kind];
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">OPERAÇÃO · DADOS DO ODOO</p>
          <h1>Estoque</h1>
          <p>
            Receba mercadorias, separe e entregue pedidos e mova produtos entre
            locais. O Odoo reserva o estoque e atualiza os saldos.
          </p>
        </div>
        {ready && canCreate && (
          <Button onClick={() => setOpened("new")}>
            <Plus size={17} /> Novo {label.one.toLowerCase()}
          </Button>
        )}
      </div>
      {!ready ? (
        <OdooUnavailable status={integration} icon={<Warehouse size={24} />} />
      ) : (
        <>
          <div className="odoo-tabs" role="tablist">
            {(Object.keys(kinds) as Kind[]).map((key) => (
              <button
                type="button"
                role="tab"
                key={key}
                aria-selected={key === kind}
                className={key === kind ? "active" : ""}
                onClick={() => {
                  setKind(key);
                  setPage(1);
                }}
              >
                {kinds[key].tab}
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
                  <option value="open">A fazer</option>
                  <option value="all">Todas</option>
                  <option value="draft">Rascunho</option>
                  <option value="waiting">Aguardando</option>
                  <option value="ready">Prontas</option>
                  <option value="done">Concluídas</option>
                  <option value="cancelled">Canceladas</option>
                </select>
                <label className="search">
                  <Search size={17} />
                  <input
                    aria-label="Buscar transferências"
                    placeholder="Buscar por referência, contato ou origem…"
                    value={q}
                    onChange={(e) => {
                      setQ(e.target.value);
                      setPage(1);
                    }}
                  />
                </label>
              </div>
            </div>
            {transfers.error ? (
              <div className="empty" role="alert">
                <h3>Não foi possível carregar o estoque</h3>
                <p>{transfers.error.message}</p>
                <Button variant="outline" onClick={() => transfers.refetch()}>
                  Tentar novamente
                </Button>
              </div>
            ) : transfers.isPending ? (
              <div className="empty">Buscando transferências no Odoo…</div>
            ) : transfers.data.items.length ? (
              <>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Referência</th>
                        <th>{label.partner}</th>
                        <th>Data programada</th>
                        <th>Origem</th>
                        <th>Situação</th>
                        <th>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transfers.data.items.map((t) => (
                        <tr key={t.id}>
                          <td>
                            <div className="product-name">
                              <span>
                                <Warehouse size={18} />
                              </span>
                              <strong className="mono">{t.number}</strong>
                            </div>
                          </td>
                          <td>{t.partner?.name ?? "—"}</td>
                          <td>{dateLabel(t.scheduled)}</td>
                          <td>{t.origin ?? "—"}</td>
                          <td>
                            <span className={"badge stage-" + t.stage}>
                              {stageLabel[t.stage]}
                            </span>
                          </td>
                          <td>
                            <div className="row-actions">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setOpened(t.id)}
                              >
                                Abrir
                              </Button>
                              <a
                                className="row-link"
                                aria-label={"Abrir " + t.number + " no Odoo"}
                                href={
                                  odooUrl +
                                  "/action-stock.action_picking_tree_all/" +
                                  t.id
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
                  <span>{transfers.data.total} transferências encontradas</span>
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
                      disabled={page * pageSize >= transfers.data.total}
                      onClick={() => setPage(page + 1)}
                    >
                      <ChevronRight size={16} />
                    </Button>
                  </div>
                </footer>
              </>
            ) : (
              <div className="empty">
                <Warehouse size={32} />
                <h3>
                  {filtered
                    ? "Nenhum resultado encontrado"
                    : "Nada a fazer em " + label.tab.toLowerCase()}
                </h3>
                <p>
                  {filtered
                    ? "Tente outra busca ou filtro."
                    : "Pedidos confirmados de compra e venda geram as transferências aqui."}
                </p>
              </div>
            )}
          </section>
          <p className="data-note">
            <ShieldCheck size={14} /> Somente transferências da empresa
            vinculada. Cada alteração fica registrada na auditoria ERA.
          </p>
        </>
      )}
      {opened && (
        <OdooRecordDialog<{ summary: OdooTransfer | null }>
          endpoint="odoo/transfers"
          recordId={opened === "new" ? undefined : opened}
          newQuery={"kind=" + kind}
          eyebrow="ESTOQUE · ODOO"
          title={(form) =>
            opened === "new"
              ? "Novo " + label.one.toLowerCase()
              : form?.summary
                ? kinds[form.summary.kind].one + " " + form.summary.number
                : "Carregando…"
          }
          canEdit={permissions.includes(
            opened === "new" ? "inventory:create" : "inventory:update",
          )}
          invalidate={["odoo-inventory"]}
          createLabel="Criar"
          header={(form) =>
            form.summary && <TransferSummary transfer={form.summary} />
          }
          actions={(form, busy) =>
            form.summary && (
              <TransferActions
                transfer={form.summary}
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

function TransferSummary({ transfer }: { transfer: OdooTransfer }) {
  return (
    <dl className="sale-facts">
      <div>
        <dt>Situação</dt>
        <dd>
          <span className={"badge stage-" + transfer.stage}>
            {stageLabel[transfer.stage]}
          </span>
        </dd>
      </div>
      <div>
        <dt>Operação</dt>
        <dd>{transfer.operation?.name ?? "—"}</dd>
      </div>
      <div>
        <dt>Data programada</dt>
        <dd>{dateLabel(transfer.scheduled)}</dd>
      </div>
      <div>
        <dt>Concluído em</dt>
        <dd>{transfer.done ? dateLabel(transfer.done) : "—"}</dd>
      </div>
    </dl>
  );
}

// Etapas do Odoo; bloqueadas enquanto há alterações não salvas.
function TransferActions({
  transfer,
  busy,
  permissions,
}: {
  transfer: OdooTransfer;
  busy: boolean;
  permissions: string[];
}) {
  const cache = useQueryClient();
  const action = useMutation({
    mutationFn: (name: "confirm" | "assign" | "validate" | "cancel") =>
      api<OdooTransfer>("odoo/transfers/" + transfer.id + "/" + name, {
        method: "POST",
      }),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ["odoo-inventory"] });
      void cache.invalidateQueries({ queryKey: ["odoo-products"] });
      void cache.invalidateQueries({ queryKey: ["odoo-form"] });
      void cache.invalidateQueries({ queryKey: ["audit"] });
    },
  });
  if (!permissions.includes("inventory:validate")) return null;
  const disabled = busy || action.isPending;
  const { stage } = transfer;
  const open = stage === "waiting" || stage === "ready";
  return (
    <>
      {stage === "draft" && (
        <Button
          type="button"
          disabled={disabled}
          title={busy ? "Salve as alterações antes" : undefined}
          onClick={() => action.mutate("confirm")}
        >
          Marcar como a fazer
        </Button>
      )}
      {open && (
        <Button
          type="button"
          disabled={disabled}
          title={busy ? "Salve as alterações antes" : undefined}
          onClick={() => action.mutate("validate")}
        >
          Validar
        </Button>
      )}
      {stage === "waiting" && (
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={() => action.mutate("assign")}
        >
          Verificar disponibilidade
        </Button>
      )}
      {(stage === "draft" || open) && (
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={() => {
            if (confirm("Cancelar " + transfer.number + " no Odoo?"))
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
