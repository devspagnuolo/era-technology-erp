import { test } from "node:test";
import assert from "node:assert/strict";
import { can, tenantScope, Principal } from "../packages/shared/security";
const operator: Principal = {
  tenantId: "company-a",
  userId: "user-a",
  sessionId: "session-a",
  permissions: ["products:read"],
};
test("nega ação sem permissão mesmo com usuário autenticado", () => {
  assert.equal(can(operator, "products:create"), false);
  assert.equal(can(operator, "products:read"), true);
});
test("impede consulta sem tenant", () => {
  assert.throws(() => tenantScope(""));
  assert.throws(() => tenantScope(" "));
});
