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
    ],
  },
  OPERATOR: {
    label: "Operador",
    permissions: ["products:read", "contacts:read"],
  },
  FINANCIAL: {
    label: "Financeiro",
    permissions: ["core:read", "contacts:read"],
  },
  FISCAL: { label: "Fiscal", permissions: ["core:read", "contacts:read"] },
  COMMERCIAL: {
    label: "Comercial",
    permissions: ["products:read", ...contactsFull],
  },
  INVENTORY: { label: "Estoque", permissions: ["products:read"] },
  PURCHASES: {
    label: "Compras",
    permissions: ["products:read", ...contactsFull],
  },
};
export function mayGrant(
  actorPermissions: readonly string[],
  requested: readonly string[],
) {
  return requested.every((p) => actorPermissions.includes(p));
}
