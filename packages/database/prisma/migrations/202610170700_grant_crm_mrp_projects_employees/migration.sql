-- Concede explicitamente as permissões de CRM, Fabricação, Projeto e
-- Funcionários (Odoo) aos administradores existentes, cujo perfil predefinido
-- inclui todas as permissões.
UPDATE "User"
SET "permissions" = "permissions" || ARRAY['crm:read', 'crm:create', 'crm:update', 'manufacturing:read', 'manufacturing:create', 'manufacturing:update', 'manufacturing:produce', 'projects:read', 'projects:create', 'projects:update', 'employees:read', 'employees:create', 'employees:update']::TEXT[]
WHERE "role" = 'TENANT_ADMIN'
  AND NOT ('crm:read' = ANY ("permissions"));
