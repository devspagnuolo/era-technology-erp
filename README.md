# ERA Technology ERP

Monorepo do núcleo ERP, em implementação. A primeira fatia funcional cobre autenticação multiempresa, permissões por ação, gestão inicial de filiais e usuários, cadastro/consulta de produtos e auditoria. Não representa a versão 1 completa.

## Executar

Requisitos: Node.js 22+, npm, Docker com Compose.

1. Copie .env.example para .env e configure JWT_SECRET e SEED_PASSWORD (mínimo 12 caracteres).
2. Execute `docker compose up -d`.
3. Execute `npm install` e `npm run db:generate`.
4. Execute `npm run db:migrate` e `node --env-file=.env --import tsx packages/database/seed.ts`.
5. Inicie a API: `node --env-file=.env --import tsx services/api/src/main.ts`.
6. Em outro terminal: `npm run dev:admin`.

Admin: http://localhost:3000. API: http://localhost:3001/v1. Swagger em desenvolvimento: http://localhost:3001/docs.
Acesso inicial: empresa era-demo, e-mail admin@era.local, senha definida em SEED_PASSWORD. O seed não altera senhas de usuários existentes.

## Qualidade

- `npm test`: regras e testes de integração quando TEST_DATABASE_URL estiver definido.
- `npm run build`: compilação da API e aplicação administrativa.
- Nunca use o banco de produção para testes.

## Estado

Consulte docs/architecture.md e docs/roadmap.md para limites, decisões e sequência de implementação.
