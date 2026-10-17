-- Concede explicitamente as permissões de faturas (Odoo) aos administradores
-- existentes, cujo perfil predefinido inclui todas as permissões.
UPDATE "User"
SET "permissions" = "permissions" || ARRAY['invoices:read', 'invoices:create', 'invoices:update', 'invoices:post']::TEXT[]
WHERE "role" = 'TENANT_ADMIN'
  AND NOT ('invoices:read' = ANY ("permissions"));
