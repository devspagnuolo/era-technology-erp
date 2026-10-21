// API do painel do proprietário: sessão própria por cookie (não usa o login
// das empresas).
export async function platform<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch("/v1/platform/" + path, { ...init, credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json", ...init.headers } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.message === "string" ? body.message : "Não foi possível concluir a operação");
  return body as T;
}
