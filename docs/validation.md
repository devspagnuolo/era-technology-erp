# Validações ERA

## Auditoria em 19/10/2026

- Produção: os serviços era-admin e era-api estão publicados na branch feat/era-admin-deploy. O commit da expansão do painel do proprietário é 738f5ce6f51168989098cb2d2c398119df8ca9d3.
- GitHub Actions (run 129, commit e115d8729f917deb151a861d2d488e743626669f): sucesso em instalação, geração Prisma, migração, paridade do esquema, testes e build.
- O serviço Odoo público abriu a tela de login; isso comprova que a página web respondeu, não que a API ERA autenticou ou executou operações JSON-RPC.
- A conexão da API com Odoo e o fluxo de leitura/gravação por todas as telas não foram testados ponta a ponta nesta auditoria.
- Os testes reais em tests/odoo.integration.test.ts são ignorados pelo node:test quando faltam TEST_ODOO_URL, TEST_ODOO_DB, TEST_ODOO_LOGIN, TEST_ODOO_API_KEY ou TEST_ODOO_COMPANIES. O workflow ci.yml não configura esses valores. Portanto, um CI verde sozinho não valida chamadas reais ao Odoo.
- Os testes Odoo existentes criam e alteram produtos, contatos, pedidos, faturas, movimentos de estoque e outros registros. Executá-los requer um banco Odoo descartável e isolado; não executar contra a base usada por clientes.

## Cobertura conhecida

A integração possui cliente JSON-RPC, esquema de formulários dinâmico baseado em get_views, onchange/name_search, gravações e motor genérico de menus/ações. Isso não equivale a reprodução visual e funcional integral do Odoo. Limites descritos em docs/odoo-integration.md incluem visualizações kanban/calendário/pivô/gráfico representadas como listas, dashboards próprios do Odoo não reproduzidos e links externos que não são abertos.

A ERA está acrescentando a exibição do texto de ajuda dos campos fornecido pelo próprio Odoo. Campos sem ajuda no Odoo continuarão sem descrição específica da empresa.

## Para concluir a validação E2E

1. Separar um Odoo de teste descartável, com os mesmos aplicativos e localização brasileira esperados.
2. Criar duas empresas de teste, usuário técnico com os grupos documentados, chave de API e vínculo de cada slug de teste.
3. Guardar as variáveis TEST_ODOO_* em um ambiente seguro de CI; nunca usar credenciais reais de produção nem imprimir valores nos logs.
4. Rodar a suíte de integração e acrescentar cenários para o motor genérico (listas, ações, assistentes e formulários) e para os campos de localização brasileira presentes nessa base.
5. Conferir a conexão do serviço de produção pela visão do proprietário autenticada e fazer testes de leitura não destrutivos. Reservar gravações para o banco isolado.

Não declare módulos integralmente validados até que esses cenários passem contra o Odoo real de teste. Registre branch, commit, resultado, ambiente e módulos instalados ao atualizar esta página.
