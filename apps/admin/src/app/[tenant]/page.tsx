"use client";
import { useParams } from "next/navigation";
import EraApp from "../../components/era-app";

export default function TenantPage() {
  const params = useParams<{ tenant: string }>();
  const tenantSlug = decodeURIComponent(params.tenant);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(tenantSlug)) {
    return (
      <main className="login login-erp">
        <section className="login-form">
          <div className="login-panel">
            <h1>Endereço de empresa inválido</h1>
            <p>Use o identificador da empresa fornecido pela ERA.</p>
          </div>
        </section>
      </main>
    );
  }
  return <EraApp tenantSlug={tenantSlug} />;
}
