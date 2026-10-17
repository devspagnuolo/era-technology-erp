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
  "customers:read",
  "customers:create",
  "customers:update",
  "suppliers:read",
  "suppliers:create",
  "suppliers:update",
  "catalog:config", // For categories, brands, units, price tables
] as const;
export type PermissionKey = (typeof permissions)[number];
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
    ],
  },
  OPERATOR: { label: "Operador", permissions: ["products:read"] },
  FINANCIAL: { label: "Financeiro", permissions: ["core:read"] },
  FISCAL: { label: "Fiscal", permissions: ["core:read"] },
  COMMERCIAL: { label: "Comercial", permissions: ["products:read"] },
  INVENTORY: { label: "Estoque", permissions: ["products:read"] },
  PURCHASES: { label: "Compras", permissions: ["products:read"] },
};
export function mayGrant(
  actorPermissions: readonly string[],
  requested: readonly string[],
) {
  return requested.every((p) => actorPermissions.includes(p));
}
