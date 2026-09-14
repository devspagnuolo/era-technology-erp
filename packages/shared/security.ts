export type Principal = {
  tenantId: string;
  userId: string;
  permissions: string[];
  sessionId: string;
};
export function can(principal: Principal, permission: string) {
  return principal.permissions.includes(permission);
}
export function tenantScope(tenantId: string) {
  if (!tenantId?.trim()) throw new Error("Tenant obrigatório");
  return { tenantId };
}
