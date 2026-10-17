# ERA Technology ERP

ERP em construção com Odoo Community como motor operacional e uma interface própria ERA. A hospedagem e os serviços de nuvem têm custos separados do licenciamento do Odoo Community. Não contratar Odoo Enterprise nem serviços pagos da KMEE; avaliar módulos comunitários OCA individualmente, inclusive licença e compatibilidade.

## Estado atual e limites

- A aplicação pública ERA é um painel de acesso e administração inicial.
- A central apresenta 19 áreas e abre o ambiente do Odoo. Hoje os cartões levam ao seletor de aplicativos; não são deep links garantidos para cada módulo.
- Produtos e estoque encaminham ao Inventário do Odoo. O Odoo é a fonte oficial dos cadastros e operações.
- Não há sincronização de dados, API Odoo integrada nem login único. O acesso ERA e o acesso Odoo são separados.
- A API e o PostgreSQL ERA continuam como base do protótipo de autenticação, permissões, usuários/filiais e auditoria. O antigo catálogo de produtos dessa API é dado de demonstração e não é fonte de verdade do Odoo.
- Fidelizei, Type Digital e Nexo CRM são integrações futuras; ainda não estão conectadas.

Consulte [arquitetura e limites](docs/architecture.md), [roadmap](docs/roadmap.md), [operação no Render](docs/render-deployment.md) e [validações](docs/validation.md).

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
