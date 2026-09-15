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

test("logout renova token expirado e revoga a sessão atual", async () => {
  const previousFetch = globalThis.fetch;
  const requests: string[] = [];
  try {
    useSession
      .getState()
      .setSession({ accessToken: "expired", refreshToken: "refresh-old" });
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      requests.push(url);
      if (url.endsWith("/auth/refresh"))
        return new Response(
          JSON.stringify({ accessToken: "fresh", refreshToken: "refresh-new" }),
        );
      const header = (init?.headers as Record<string, string>).Authorization;
      return header === "Bearer fresh"
        ? new Response(JSON.stringify({ ok: true }))
        : new Response("{}", { status: 401 });
    };
    assert.deepEqual(await api("auth/logout", { method: "POST" }), {
      ok: true,
    });
    assert.equal(
      requests.filter((url) => url.endsWith("/auth/refresh")).length,
      1,
    );
  } finally {
    globalThis.fetch = previousFetch;
    useSession.getState().setSession(null);
  }
});
test("401 atrasado reutiliza token já renovado sem nova rotação", async () => {
  const previousFetch = globalThis.fetch;
  let calls = 0;
  try {
    useSession
      .getState()
      .setSession({ accessToken: "old", refreshToken: "old-refresh" });
    globalThis.fetch = async (input) => {
      assert.ok(!String(input).endsWith("/auth/refresh"));
      if (calls++ === 0) {
        useSession
          .getState()
          .setSession({ accessToken: "new", refreshToken: "new-refresh" });
        return new Response("{}", { status: 401 });
      }
      return new Response(JSON.stringify({ ok: true }));
    };
    assert.deepEqual(await api("products"), { ok: true });
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = previousFetch;
    useSession.getState().setSession(null);
  }
});
