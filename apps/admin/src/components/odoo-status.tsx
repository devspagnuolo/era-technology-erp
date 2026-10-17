"use client";
import type { ReactNode } from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { api } from "../lib/session";
import { Button } from "./ui/button";

export type OdooStatus = {
  configured: boolean;
  connected: boolean;
  linked: boolean;
  version?: string;
};

export function useOdooStatus() {
  const status = useQuery({
    queryKey: ["odoo-status"],
    queryFn: () => api<OdooStatus>("odoo/status"),
  });
  return {
    status,
    ready: !!status.data?.connected && !!status.data.linked,
  };
}

// Explica por que os dados do Odoo não estão disponíveis, sem esconder a tela.
export function OdooUnavailable({
  status,
  icon,
}: {
  status: UseQueryResult<OdooStatus>;
  icon: ReactNode;
}) {
  if (status.isPending) return <div className="empty">Conectando ao Odoo…</div>;
  const data = status.data;
  return (
    <section className="era-odoo-handoff" role="status">
      <div className="era-handoff-icon">{icon}</div>
      <span className="era-eyebrow">INTEGRAÇÃO ODOO</span>
      <h1>
        {status.error
          ? "Não foi possível verificar a integração"
          : !data?.configured
            ? "Integração ainda não configurada"
            : !data.linked
              ? "Empresa sem vínculo no Odoo"
              : "Odoo indisponível no momento"}
      </h1>
      <p>
        {status.error?.message ??
          (!data?.configured
            ? "O administrador precisa informar o endereço do Odoo e a chave do usuário de integração na API ERA."
            : !data.linked
              ? "Esta empresa ERA ainda não foi associada a uma empresa do Odoo pelo administrador."
              : "Tente novamente em instantes. Se o Odoo estiver hibernando, a primeira resposta pode demorar.")}
      </p>
      <Button variant="outline" onClick={() => status.refetch()}>
        Tentar novamente
      </Button>
    </section>
  );
}
