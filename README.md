# ERA Technology ERP

ERP em construção com Odoo Community como motor operacional e uma interface própria ERA. A hospedagem e os serviços de nuvem têm custos separados do licenciamento do Odoo Community. Não contratar Odoo Enterprise nem serviços pagos da KMEE; avaliar módulos comunitários OCA individualmente, inclusive licença e compatibilidade.

## Estado atual e limites

- O ERA tem uma interface própria, autenticação e permissões por empresa, painel do proprietário e uma API que acessa o Odoo por JSON-RPC.
- Produtos, contatos, vendas, compras, estoque, faturas, CRM, fabricação, projetos, tarefas, funcionários, manutenção, folgas e despesas têm fluxos ERA específicos. A tela de formulários consulta o esquema e os recálculos do Odoo; o modo “Todos os aplicativos” lê menus e ações do banco Odoo.
- A API do ERA usa PostgreSQL para identidade, permissões e auditoria. Os registros operacionais ficam no Odoo.
- A integração requer credenciais técnicas e vínculo entre cada slug ERA e uma empresa res.company em ODOO_TENANT_COMPANIES. A autenticação no ERA e no Odoo são separadas; não há SSO.
- A cobertura não é 1:1 em todos os aplicativos: visões kanban/calendário/pivô/gráfico são apresentadas em lista, alguns painéis interativos e links externos não são reproduzidos, e determinadas ações ou assistentes ainda exigem validação no banco e módulos reais. Consulte os limites detalhados em [integração Odoo](docs/odoo-integration.md).
- Os testes que criam registros no Odoo só rodam com TEST_ODOO_URL, TEST_ODOO_DB, TEST_ODOO_LOGIN, TEST_ODOO_API_KEY e TEST_ODOO_COMPANIES. Sem um banco de testes isolado configurado, o CI não valida a integração ao vivo.
- Fidelizei, Type Digital e Nexo CRM ainda não estão conectadas.

Consulte [arquitetura e limites](docs/architecture.md), [roadmap](docs/roadmap.md), [operação no Render](docs/render-deployment.md), [integração Odoo](docs/odoo-integration.md) e [validações](docs/validation.md).

## Fluxo de desenvolvimento: GitHub → Render

O repositório é a fonte de verdade do código e da documentação; não depender de arquivos locais para dar continuidade.

1. Faça alterações em uma branch GitHub derivada de `feat/era-admin-deploy`.
2. Revise e valide o diff; use os checks do GitHub quando disponíveis.
3. Integre a mudança em `feat/era-admin-deploy`. O Render acompanha essa branch para `era-admin` e `era-api`.
4. O serviço Odoo acompanha `feat/odoo-community-poc`, isolado dos deploys ERA. Não misture alterações nessa branch.
5. Configure segredos somente no ambiente privado do Render; nunca os coloque no GitHub, em commits, documentação ou variáveis `NEXT_PUBLIC_*`.

Alterações de infraestrutura em `render.yaml` exigem revisão explícita do diff e do custo no Render antes de sincronizar o Blueprint. Uma alteração apenas de interface/documentação não deve mudar planos ou criar serviços.

## Serviços publicados

| Serviço | Papel | Estado/configuração |
|---|---|---|
| `era-admin` | Painel ERA Next.js | Render Free; `https://era-admin-fxf1.onrender.com`; branch `feat/era-admin-deploy` |
| `era-api` | API privada NestJS | Render `0.5c-512mb`; branch `feat/era-admin-deploy` |
| `era-db` | PostgreSQL ERA | PostgreSQL 18; plano definido em `render.yaml`; sem allowlist de acesso externo |
| `era-odoo-poc` | Odoo Community existente | `https://era-odoo-poc.onrender.com`; branch `feat/odoo-community-poc`; serviço independente |

Planos e valores faturados podem mudar; o painel/fatura do Render é a referência de cobrança, não uma estimativa fixa neste README.

## Conta de demonstração ERA

O seed inicial define empresa `era-demo` e e-mail `admin@era.local`. A senha inicial é mantida em `SEED_PASSWORD`, no ambiente privado de `era-api`. O seed não troca a senha de uma conta que já existe. Essa conta ERA não é automaticamente uma conta Odoo; o Odoo pode solicitar autenticação separada.

## Qualidade e segurança

Os workflows de CI e os comandos de teste/build são definidos no repositório. Nunca use banco de produção para testes. Não registre dados reais de clientes, credenciais ou documentos fiscais durante o piloto.
