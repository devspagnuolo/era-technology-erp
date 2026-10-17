-- Concede explicitamente as permissões de compras (Odoo) aos administradores
-- existentes, cujo perfil predefinido inclui todas as permissões.
UPDATE "User"
SET "permissions" = "permissions" || ARRAY['purchases:read', 'purchases:create', 'purchases:update', 'purchases:confirm']::TEXT[]
WHERE "role" = 'TENANT_ADMIN'
  AND NOT ('purchases:read' = ANY ("permissions"));
