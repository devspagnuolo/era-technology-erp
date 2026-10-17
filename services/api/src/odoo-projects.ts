import { Inject, Injectable } from "@nestjs/common";
import { OdooScope } from "./odoo-scope";
import { OdooForms } from "./odoo-form";
import { Domain } from "./odoo";
import { AppConfig, OdooApp, appController, ref, text } from "./odoo-app";

// Projetos (project.project) e tarefas (project.task) com os formulários do
// Odoo. A etapa da tarefa é um campo do formulário; concluir, cancelar e
// reabrir mudam a situação da tarefa como no Odoo.
const ACTIVE: Domain = [["active", "in", [true, false]]];
const names = (value: unknown) => (Array.isArray(value) ? value.length : 0);

export const PROJECTS: AppConfig = {
  model: "project.project",
  module: "odoo.projects",
  notFound: "Projeto não encontrado",
  form: { hidden: ["company_id"] },
  domain: ACTIVE,
  fields: [
    "name",
    "partner_id",
    "user_id",
    "date_start",
    "date",
    "task_count",
    "open_task_count",
    "tag_ids",
    "last_update_status",
    "active",
  ],
  search: ["name", "partner_id.name"],
  order: "sequence, name, id",
  filters: {
    active: [["active", "=", true]],
    archived: [["active", "=", false]],
    all: [],
  },
  defaultFilter: "active",
  toEra: (row) => ({
    id: row.id,
    name: row.name,
    customer: ref(row.partner_id),
    manager: ref(row.user_id),
    start: text(row.date_start),
    end: text(row.date),
    tasks: Number(row.task_count ?? 0),
    openTasks: Number(row.open_task_count ?? 0),
    tags: names(row.tag_ids),
    status: text(row.last_update_status),
    active: !!row.active,
  }),
};

export const TASK_STATES = {
  done: "1_done",
  cancelled: "1_canceled",
  open: "01_in_progress",
} as const;
const CLOSED = [TASK_STATES.done, TASK_STATES.cancelled];
const setState =
  (state: string) =>
  async ({
    odoo,
    companyId,
    model,
    id,
  }: Parameters<NonNullable<AppConfig["actions"]>[string]["run"]>[0]) => {
    await odoo.execute(companyId, model, "write", [[id], { state }]);
  };

export const TASKS: AppConfig = {
  model: "project.task",
  module: "odoo.tasks",
  notFound: "Tarefa não encontrada",
  // A etapa pessoal (tarefas sem projeto) depende do usuário logado no Odoo,
  // que aqui é o usuário técnico da integração.
  form: { hidden: ["company_id", "personal_stage_type_id"] },
  domain: ACTIVE,
  fields: [
    "name",
    "project_id",
    "stage_id",
    "state",
    "user_ids",
    "partner_id",
    "date_deadline",
    "priority",
    "parent_id",
    "active",
  ],
  search: ["name", "project_id.name", "partner_id.name"],
  order: "priority desc, sequence, id desc",
  filters: {
    open: [
      ["active", "=", true],
      ["state", "not in", CLOSED],
    ],
    done: [["state", "=", TASK_STATES.done]],
    cancelled: [["state", "=", TASK_STATES.cancelled]],
    all: [],
  },
  defaultFilter: "open",
  where: (query) => {
    const project = Number(query.project);
    return Number.isInteger(project) && project > 0
      ? [["project_id", "=", project]]
      : [];
  },
  newContext: (query) => {
    const project = Number(query.project);
    return Number.isInteger(project) && project > 0
      ? { default_project_id: project }
      : {};
  },
  toEra: (row) => ({
    id: row.id,
    name: row.name,
    project: ref(row.project_id),
    stage: ref(row.stage_id),
    state: row.state,
    closed: CLOSED.includes(row.state as never),
    assignees: names(row.user_ids),
    customer: ref(row.partner_id),
    deadline: text(row.date_deadline),
    priority: Number(row.priority ?? 0),
    parent: ref(row.parent_id),
  }),
  actions: {
    done: {
      allowed: (s) => !s.closed,
      run: setState(TASK_STATES.done),
    },
    cancel: {
      allowed: (s) => !s.closed,
      run: setState(TASK_STATES.cancelled),
    },
    reopen: { allowed: (s) => !!s.closed, run: setState(TASK_STATES.open) },
  },
};

@Injectable()
export class OdooProjects extends OdooApp {
  constructor(
    @Inject(OdooScope) scope: OdooScope,
    @Inject(OdooForms) forms: OdooForms,
  ) {
    super(scope, forms, PROJECTS);
  }
}
@Injectable()
export class OdooTasks extends OdooApp {
  constructor(
    @Inject(OdooScope) scope: OdooScope,
    @Inject(OdooForms) forms: OdooForms,
  ) {
    super(scope, forms, TASKS);
  }
}
export const OdooProjectsController = appController(
  "odoo/projects",
  "projects",
  OdooProjects,
);
export const OdooTasksController = appController(
  "odoo/tasks",
  "projects",
  OdooTasks,
);
