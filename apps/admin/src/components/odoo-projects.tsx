"use client";
import { useState } from "react";
import { FolderKanban, ListChecks, X } from "lucide-react";
import { Button } from "./ui/button";
import {
  type AppKind,
  type Ref,
  Badge,
  OdooApp,
  dateLabel,
  refName,
} from "./odoo-app";

type Project = {
  id: number;
  name: string;
  customer: Ref;
  manager: Ref;
  start: string | null;
  end: string | null;
  tasks: number;
  openTasks: number;
  active: boolean;
};
type Task = {
  id: number;
  name: string;
  project: Ref;
  stage: Ref;
  state: string;
  closed: boolean;
  assignees: number;
  customer: Ref;
  deadline: string | null;
  priority: number;
};
const projectBadge = (p: Project) =>
  p.active ? (
    <Badge stage="ready" label="Ativo" />
  ) : (
    <Badge stage="cancelled" label="Arquivado" />
  );
const taskStates: Record<string, [string, string]> = {
  "01_in_progress": ["open", "Em andamento"],
  "02_changes_requested": ["waiting", "Alterações solicitadas"],
  "03_approved": ["ready", "Aprovada"],
  "04_waiting_normal": ["waiting", "Aguardando"],
  "1_done": ["done", "Concluída"],
  "1_canceled": ["cancelled", "Cancelada"],
};
const taskBadge = (t: Task) => {
  const [stage, label] = taskStates[t.state] ?? ["open", t.state];
  return <Badge stage={stage} label={label} />;
};

const PROJECTS: AppKind<Project> = {
  endpoint: "odoo/projects",
  permission: "projects",
  eyebrow: "PROJETO",
  title: "Projetos",
  description:
    "Organize projetos e tarefas: cliente, responsável, prazos, etapas e subtarefas, com os mesmos campos do Odoo.",
  icon: <FolderKanban size={18} />,
  noun: {
    one: "Projeto",
    many: "Projetos",
    new: "Novo projeto",
    empty: "Nenhum projeto ativo",
  },
  filters: [
    ["active", "Ativos"],
    ["archived", "Arquivados"],
    ["all", "Todos"],
  ],
  searchPlaceholder: "Buscar por projeto ou cliente…",
  columns: [
    { label: "Projeto", render: (p) => p.name },
    { label: "Cliente", render: (p) => refName(p.customer) },
    { label: "Responsável", render: (p) => refName(p.manager) },
    { label: "Início", render: (p) => dateLabel(p.start) },
    { label: "Fim", render: (p) => dateLabel(p.end) },
    {
      label: "Tarefas abertas",
      numeric: true,
      render: (p) => p.openTasks + " de " + p.tasks,
    },
    { label: "Situação", render: projectBadge },
  ],
  facts: (p) => [
    ["Situação", projectBadge(p)],
    ["Cliente", refName(p.customer)],
    ["Tarefas abertas", p.openTasks + " de " + p.tasks],
    ["Período", dateLabel(p.start) + " a " + dateLabel(p.end)],
  ],
  actions: [
    {
      name: "archive",
      label: "Arquivar",
      variant: "outline",
      active: false,
      when: (p) => p.active,
      confirm: (p) => "Arquivar o projeto " + p.name + " no Odoo?",
    },
    {
      name: "unarchive",
      label: "Reativar",
      variant: "outline",
      active: true,
      when: (p) => !p.active,
    },
  ],
  titleOf: (p) => p.name,
};

const TASKS: AppKind<Task> = {
  endpoint: "odoo/tasks",
  permission: "projects",
  eyebrow: "PROJETO",
  title: "Tarefas",
  description:
    "Tarefas dos projetos com etapa, responsáveis, prazo e subtarefas. Mude a etapa no formulário, como no quadro do Odoo.",
  icon: <ListChecks size={18} />,
  noun: {
    one: "Tarefa",
    many: "Tarefas",
    new: "Nova tarefa",
    empty: "Nenhuma tarefa em aberto",
  },
  filters: [
    ["open", "Em aberto"],
    ["done", "Concluídas"],
    ["cancelled", "Canceladas"],
    ["all", "Todas"],
  ],
  searchPlaceholder: "Buscar por tarefa, projeto ou cliente…",
  columns: [
    { label: "Tarefa", render: (t) => t.name },
    { label: "Projeto", render: (t) => refName(t.project) },
    { label: "Etapa", render: (t) => refName(t.stage) },
    { label: "Prazo", render: (t) => dateLabel(t.deadline) },
    { label: "Responsáveis", numeric: true, render: (t) => t.assignees },
    { label: "Situação", render: taskBadge },
  ],
  facts: (t) => [
    ["Situação", taskBadge(t)],
    ["Projeto", refName(t.project)],
    ["Etapa", refName(t.stage)],
    ["Prazo", dateLabel(t.deadline)],
  ],
  actions: [
    { name: "done", label: "Concluir", when: (t) => !t.closed },
    {
      name: "cancel",
      label: "Cancelar",
      variant: "outline",
      when: (t) => !t.closed,
      confirm: (t) => "Cancelar a tarefa " + t.name + "?",
    },
    {
      name: "reopen",
      label: "Reabrir",
      variant: "outline",
      when: (t) => t.closed,
    },
  ],
  titleOf: (t) => t.name,
};

export function OdooProjects(props: {
  permissions: string[];
}) {
  const [tab, setTab] = useState<"projects" | "tasks">("projects");
  const [project, setProject] = useState<{ id: number; name: string } | null>(
    null,
  );
  return (
    <>
      <div className="odoo-tabs" role="tablist">
        {(
          [
            ["projects", "Projetos"],
            ["tasks", "Tarefas"],
          ] as const
        ).map(([key, label]) => (
          <button
            type="button"
            role="tab"
            key={key}
            aria-selected={key === tab}
            className={key === tab ? "active" : ""}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "projects" ? (
        <OdooApp
          kind={PROJECTS}
          {...props}
          rowActions={(p) => (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setProject({ id: p.id, name: p.name });
                setTab("tasks");
              }}
            >
              Tarefas
            </Button>
          )}
        />
      ) : (
        <OdooApp
          key={project?.id ?? "all"}
          kind={TASKS}
          {...props}
          query={project ? { project: String(project.id) } : {}}
          toolbar={
            project && (
              <Button
                variant="outline"
                size="sm"
                aria-label="Mostrar tarefas de todos os projetos"
                onClick={() => setProject(null)}
              >
                {project.name} <X size={14} />
              </Button>
            )
          }
        />
      )}
    </>
  );
}
