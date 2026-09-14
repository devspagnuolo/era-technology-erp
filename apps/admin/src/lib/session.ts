import { create } from "zustand";
type Session = { accessToken: string; refreshToken: string };
export const useSession = create<{
  session: Session | null;
  generation: number;
  setSession: (session: Session | null) => void;
}>((set) => ({
  session: null,
  generation: 0,
  setSession: (session) =>
    set((state) => ({
      session,
      generation: state.generation + (!session || !state.session ? 1 : 0),
    })),
}));
const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
let refresh: Promise<boolean> | null = null;
export async function api<T>(
  path: string,
  init: RequestInit = {},
  retry = true,
): Promise<T> {
  const generation = useSession.getState().generation;
  const token = useSession.getState().session?.accessToken;
  const response = await fetch(base + "/v1/" + path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
      ...init.headers,
    },
  });
  if (generation !== useSession.getState().generation)
    throw new Error("Sessão alterada. Acesse novamente.");
  if (response.status === 401 && retry && token && !path.startsWith("auth/")) {
    refresh ??= (async () => {
      const session = useSession.getState().session;
      if (!session) return false;
      try {
        const result = await api<Session>(
          "auth/refresh",
          {
            method: "POST",
            body: JSON.stringify({ refreshToken: session.refreshToken }),
          },
          false,
        );
        if (
          useSession.getState().session?.refreshToken !== session.refreshToken
        )
          return false;
        useSession.getState().setSession(result);
        return true;
      } catch {
        if (
          useSession.getState().session?.refreshToken === session.refreshToken
        )
          useSession.getState().setSession(null);
        return false;
      } finally {
        refresh = null;
      }
    })();
    if (await refresh) return api<T>(path, init, false);
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(
      typeof body.message === "string"
        ? body.message
        : "Não foi possível concluir a operação",
    );
  }
  return response.json();
}
