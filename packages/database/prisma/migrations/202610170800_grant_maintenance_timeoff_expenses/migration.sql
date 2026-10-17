-- Concede explicitamente as permissões de Manutenção, Folga e Despesas (Odoo)
-- aos administradores existentes, cujo perfil predefinido inclui todas as
-- permissões.
UPDATE "User"
SET "permissions" = "permissions" || ARRAY['maintenance:read', 'maintenance:create', 'maintenance:update', 'timeoff:read', 'timeoff:create', 'timeoff:update', 'timeoff:approve', 'expenses:read', 'expenses:create', 'expenses:update', 'expenses:approve']::TEXT[]
WHERE "role" = 'TENANT_ADMIN'
  AND NOT ('maintenance:read' = ANY ("permissions"));
