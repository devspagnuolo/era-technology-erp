-- Concede o acesso aos demais aplicativos do Odoo (motor genérico da ERA),
-- inclusive instalar aplicativos e alterar configurações, aos
-- administradores existentes, cujo perfil predefinido inclui todas as
-- permissões.
UPDATE "User"
SET "permissions" = "permissions" || ARRAY['odoo:read', 'odoo:write', 'odoo:admin']::TEXT[]
WHERE "role" = 'TENANT_ADMIN'
  AND NOT ('odoo:read' = ANY ("permissions"));
