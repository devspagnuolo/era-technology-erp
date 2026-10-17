# Plano de implementação

## Entregue nesta base

- Estrutura inicial do monorepo e configuração local PostgreSQL/Redis.
- Schema e migration inicial; seed idempotente com senha externa.
- Login, refresh com rotação, logout e usuário autenticado.
- Permissões por ação e isolamento por tenant nos endpoints implementados.
- Consulta e cadastro de filiais.
- Consulta e cadastro de usuários, perfis predefinidos, ativação/desativação e revogação de sessões.
- Consulta de auditoria.
- Criação, edição, inativação e consulta paginada de produtos com busca, validação, unicidade, auditoria e evento transacional.
- Interface administrativa conectada à API: login, produtos, filiais, usuários, perfis e auditoria.
- Relay da outbox e consumidor idempotente inicial.

## Próxima etapa: concluir CORE

1. Gestão de empresas e configurações; edição/inativação de filiais.
2. Convites, edição/paginação de usuários, recuperação de senha e gestão de sessões.
3. Entidades de perfis/permissões, papéis solicitados e políticas por registro e filial.
4. Auditoria de operações administrativas e de autenticação, filtros, paginação e exportação.
5. Instrumentação Sentry/OpenTelemetry e controle de arquivos com S3 compatível.

## Sequência funcional

2. Cadastros: completar produtos (categorias, marcas, unidades e preços), clientes, fornecedores e transportadoras.
3. Estoque: depósitos, ledger, saldos, custos, reservas, transferências e inventários; concorrência e idempotência transacionais.
4. Compras: solicitações → cotações → pedido → recebimento → entrada; importação XML.
5. Vendas: orçamento → pedido → venda → financeiro/estoque; trocas e devoluções.
6. Financeiro: contas, baixas, tesouraria, centros de custo, categorias, conciliação e fluxo de caixa.
7. Dashboards calculados sobre transações, filtros de período/empresa/filial/categoria/status e exportação.

Cada etapa requer regras de domínio, migrations, permissões, eventos, APIs, UI e testes. CRM, marketing, fidelidade, marketplaces e IA permanecem apenas contratos até o ERP estar consistente.
