-- Concede explicitamente as permissões de contatos (Odoo) aos administradores
-- existentes, cujo perfil predefinido inclui todas as permissões.
UPDATE "User"
SET "permissions" = "permissions" || ARRAY['contacts:read', 'contacts:create', 'contacts:update']::TEXT[]
WHERE "role" = 'TENANT_ADMIN'
  AND NOT ('contacts:read' = ANY ("permissions"));
