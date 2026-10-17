export const permissions = [
  "core:read",
  "branches:create",
  "branches:update",
  "tenant:update",
  "users:read",
  "users:create",
  "users:update",
  "profiles:read",
  "products:read",
  "products:create",
  "products:update",
  "audit:read",
  "contacts:read",
  "contacts:create",
  "contacts:update",
  "sales:read",
  "sales:create",
  "sales:update",
  "sales:confirm",
  "purchases:read",
  "purchases:create",
  "purchases:update",
  "purchases:confirm",
  "inventory:read",
  "inventory:create",
  "inventory:update",
  "inventory:validate",
  "invoices:read",
  "invoices:create",
  "invoices:update",
  "invoices:post",
  "crm:read",
  "crm:create",
  "crm:update",
  "manufacturing:read",
  "manufacturing:create",
  "manufacturing:update",
  "manufacturing:produce",
  "projects:read",
  "projects:create",
  "projects:update",
  "employees:read",
  "employees:create",
  "employees:update",
  "customers:read",
  "customers:create",
  "customers:update",
  "suppliers:read",
  "suppliers:create",
  "suppliers:update",
  "catalog:config", // For categories, brands, units, price tables
] as const;
export type PermissionKey = (typeof permissions)[number];
const contactsFull: PermissionKey[] = [
  "contacts:read",
  "contacts:create",
  "contacts:update",
];
const salesFull: PermissionKey[] = [
  "sales:read",
  "sales:create",
  "sales:update",
  "sales:confirm",
];
const purchasesFull: PermissionKey[] = [
  "purchases:read",
  "purchases:create",
  "purchases:update",
  "purchases:confirm",
];
const inventoryFull: PermissionKey[] = [
  "inventory:read",
  "inventory:create",
  "inventory:update",
  "inventory:validate",
];
const invoicesFull: PermissionKey[] = [
  "invoices:read",
  "invoices:create",
  "invoices:update",
  "invoices:post",
];
const crmFull: PermissionKey[] = ["crm:read", "crm:create", "crm:update"];
const manufacturingFull: PermissionKey[] = [
  "manufacturing:read",
  "manufacturing:create",
  "manufacturing:update",
  "manufacturing:produce",
];
const projectsFull: PermissionKey[] = [
  "projects:read",
  "projects:create",
  "projects:update",
];
const employeesFull: PermissionKey[] = [
  "employees:read",
  "employees:create",
  "employees:update",
];
export const rolePresets: Record<
  string,
  { label: string; permissions: PermissionKey[] }
> = {
  TENANT_ADMIN: { label: "Admin Empresa", permissions: [...permissions] },
  MANAGER: {
    label: "Gestor",
    permissions: [
      "core:read",
      "users:read",
      "profiles:read",
      "products:read",
      "products:create",
      "products:update",
      ...contactsFull,
      ...salesFull,
      ...purchasesFull,
      ...inventoryFull,
      ...invoicesFull,
      ...crmFull,
      ...manufacturingFull,
      ...projectsFull,
      ...employeesFull,
      "audit:read",
    ],
  },
  SUPERVISOR: {
    label: "Supervisor",
    permissions: [
      "core:read",
      "products:read",
      "products:create",
      "products:update",
      ...contactsFull,
      ...salesFull,
      ...purchasesFull,
      ...inventoryFull,
      ...crmFull,
      ...manufacturingFull,
      ...projectsFull,
      "employees:read",
    ],
  },
  OPERATOR: {
    label: "Operador",
    permissions: [
      "products:read",
      "contacts:read",
      "sales:read",
      "inventory:read",
      "manufacturing:read",
      "projects:read",
    ],
  },
  FINANCIAL: {
    label: "Financeiro",
    permissions: [
      "core:read",
      "contacts:read",
      "sales:read",
      "purchases:read",
      ...invoicesFull,
    ],
  },
  FISCAL: {
    label: "Fiscal",
    permissions: ["core:read", "contacts:read", "invoices:read"],
  },
  COMMERCIAL: {
    label: "Comercial",
    permissions: ["products:read", ...contactsFull, ...salesFull, ...crmFull],
  },
  INVENTORY: {
    label: "Estoque",
    permissions: [
      "products:read",
      "contacts:read",
      ...inventoryFull,
      ...manufacturingFull,
    ],
  },
  PURCHASES: {
    label: "Compras",
    permissions: [
      "products:read",
      ...contactsFull,
      ...purchasesFull,
      "inventory:read",
    ],
  },
};
export function mayGrant(
  actorPermissions: readonly string[],
  requested: readonly string[],
) {
  return requested.every((p) => actorPermissions.includes(p));
}
