-- Empresa do Odoo criada para cada tenant novo (painel do proprietário).
ALTER TABLE "Tenant" ADD COLUMN "odooCompanyId" INTEGER;
CREATE UNIQUE INDEX "Tenant_odooCompanyId_key" ON "Tenant"("odooCompanyId");
