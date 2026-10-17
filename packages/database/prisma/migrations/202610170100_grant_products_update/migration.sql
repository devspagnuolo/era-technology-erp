-- Concede explicitamente a nova permissão de edição de produtos aos
-- administradores existentes, cujo perfil predefinido inclui todas as permissões.
UPDATE "User"
SET "permissions" = array_append("permissions", 'products:update')
WHERE "role" = 'TENANT_ADMIN'
  AND NOT ('products:update' = ANY ("permissions"));
