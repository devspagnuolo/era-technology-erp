-- Senha temporária definida pelo proprietário: troca obrigatória no acesso.
ALTER TABLE "User" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
