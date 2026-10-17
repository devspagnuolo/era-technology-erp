# Validações ERA

## Estado do deploy visual (17/10/2026)

- Branch de produção do painel: `feat/era-admin-deploy`.
- Commit da interface validada: `ff80a470743dd36f85d035f5a332ce1aae4957a6` ([commit no GitHub](https://github.com/devspagnuolo/era-technology-erp/commit/ff80a470743dd36f85d035f5a332ce1aae4957a6)).
- Deploy Render que ficou ativo: `dep-db9fv1gjgiss738pfm90`.
- Build de produção do admin concluído sem erro de compilação ou TypeScript antes da publicação.
- A página pública de login foi conferida no navegador: logo oficial, texto e layout estreito responsivo visíveis.
- O acesso pós-login não foi testado nesta verificação; não foram inseridas credenciais para a conta ERA.
- O link para Odoo e a central de módulos não constituem prova de integração. API Odoo, SSO, leitura/escrita sincronizada e isolamento de empresas Odoo ainda não foram testados nem implementados.
- O último commit aqui descrito é o da interface; commits posteriores podem atualizar documentação sem mudar esse resultado visual. Confirme o deploy ativo no Render antes de usar como evidência operacional.

## Validações históricas da base

Verificações executadas em 14/09/2026: 15 testes aprovados, zero falhas e 1 teste de integração PostgreSQL ignorado sem `TEST_DATABASE_URL`; build da API/admin/worker aprovado naquela versão; auditoria npm sem vulnerabilidades reportadas naquela data. Esses resultados são históricos e não atestam a versão atual.

A rotina `.github/workflows/ci.yml` foi criada para executar testes com PostgreSQL; valide o resultado dos checks no GitHub para cada commit. Não presumir que um teste histórico cobre mudanças atuais.

## Ainda não validado

- Login ERA ponta a ponta, navegação após autenticação e controles administrativos em produção.
- Odoo API/SSO, links diretos aos módulos, permissões e regras multiempresa.
- Integrações Fidelizei, Type Digital ou Nexo CRM.
- Recuperação de backup, carga, observabilidade e operação de filas com Redis real.
- Licença/compatibilidade de cada addon OCA que venha a ser instalado.

Não usar bancos de produção, dados fiscais reais ou credenciais reais para testar. Registre nesta página data, branch, commit, cenário, resultado e responsável por cada nova validação.
