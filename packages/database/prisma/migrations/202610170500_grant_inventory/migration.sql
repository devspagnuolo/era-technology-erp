-- Concede explicitamente as permissões de estoque (Odoo) aos administradores
-- existentes, cujo perfil predefinido inclui todas as permissões.
UPDATE "User"
SET "permissions" = "permissions" || ARRAY['inventory:read', 'inventory:create', 'inventory:update', 'inventory:validate']::TEXT[]
WHERE "role" = 'TENANT_ADMIN'
  AND NOT ('inventory:read' = ANY ("permissions"));
