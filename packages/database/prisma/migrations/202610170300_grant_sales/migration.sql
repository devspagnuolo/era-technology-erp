-- Concede explicitamente as permissões de vendas (Odoo) aos administradores
-- existentes, cujo perfil predefinido inclui todas as permissões.
UPDATE "User"
SET "permissions" = "permissions" || ARRAY['sales:read', 'sales:create', 'sales:update', 'sales:confirm']::TEXT[]
WHERE "role" = 'TENANT_ADMIN'
  AND NOT ('sales:read' = ANY ("permissions"));
