import { test } from "node:test";
import assert from "node:assert/strict";
import { useSession, api } from "../apps/admin/src/lib/session";
test("troca de identidade renova o cache e rotação de token preserva a sessão", () => {
  useSession.getState().setSession(null);
  const before = useSession.getState().generation;
  useSession.getState().setSession({ accessToken: "a", refreshToken: "r" });
  assert.equal(useSession.getState().generation, before + 1);
  useSession.getState().setSession({ accessToken: "b", refreshToken: "s" });
  assert.equal(useSession.getState().generation, before + 1);
  useSession.getState().setSession(null);
  assert.equal(useSession.getState().generation, before + 2);
});
test("resposta antiga não atravessa uma troca de sessão", async () => {
  const previousFetch = globalThis.fetch;
  try {
    useSession.getState().setSession({ accessToken: "a", refreshToken: "r" });
    globalThis.fetch = async () => {
      useSession.getState().setSession(null);
      return new Response(JSON.stringify({ secret: "company-a" }), {
        status: 200,
      });
    };
    await assert.rejects(() => api("products"), /Sessão alterada/);
  } finally {
    globalThis.fetch = previousFetch;
    useSession.getState().setSession(null);
  }
});
