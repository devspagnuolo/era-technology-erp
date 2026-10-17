# Operação ERA no Render

Estado verificado em 17/10/2026. O GitHub é a fonte de verdade do código; o Render acompanha branches publicadas. Os serviços da ERA e o serviço Odoo são separados.

## Serviços e branches

| Serviço | Render | Branch | Papel |
|---|---|---|---|
| `era-admin` | Web Service, plano Free, Virginia; [painel](https://era-admin-fxf1.onrender.com/) | `feat/era-admin-deploy` | Next.js público; build `npm ci --include=dev && npm run build -w @era/admin`; health check `/v1/health` |
| `era-api` | Private Service, plano `0.5c-512mb`, Virginia | `feat/era-admin-deploy` | NestJS privado; migrations/seed em pre-deploy; health via proxy do painel |
| `era-db` | PostgreSQL 18, Virginia; plano `0.1c-256mb` declarado em `render.yaml`; allowlist externa vazia | definido pelo Blueprint | PostgreSQL exclusivo da API ERA |
| `era-odoo-poc` | Web Service Docker, plano `1c-2g`, Virginia; [Odoo](https://era-odoo-poc.onrender.com/) | `feat/odoo-community-poc` | Odoo Community independente; não atualizar durante deploy da interface ERA |

IDs observados: painel `srv-db9fktm1egvs73f3dur0`; API `srv-db9fjv61egvs73f3a300`; Odoo `srv-db9bh32jnfac73bm4qi0`. Consulte o painel Render para IDs/estado de banco e fatura atuais. Os nomes dos planos são registro de configuração, não garantia de disponibilidade ou preço futuro.

A hospedagem do Odoo no Render pode ter cobrança mesmo usando a edição Community gratuita. Valores de planos e faturas mudam: confirme no workspace ERA antes de aplicar alterações. Não sincronizar Blueprint nem mudar plano, região, disco, banco ou variáveis sem revisar o diff e o custo; uma alteração de infraestrutura pode interromper serviços.

## Deploy por GitHub

`era-admin` e `era-api` estão ligados ao repositório `devspagnuolo/era-technology-erp`, branch `feat/era-admin-deploy`, com deploy automático condicionado a checks. A branch Odoo é `feat/odoo-community-poc`. Mudanças de interface/documentação ficam no primeiro branch; código Odoo exige tarefa e revisão próprias. O painel usa endereço público; a API e o banco são internos.

Uma atualização de código pode executar novo deploy. O pre-deploy da API executa migrations e seed idempotentes; isso não deve ser confundido com alteração de interface sem impacto, pois o serviço API pode reiniciar. Evite commits separados em sequência quando uma mudança única puder ser agrupada. Uma alteração de `render.yaml` pode provocar sincronização de recursos; revisar antes de aplicar.

## Variáveis e segredos

- `DATABASE_URL`: conexão privada vinculada ao PostgreSQL ERA.
- `JWT_SECRET` e `SEED_PASSWORD`: gerados/guardados no ambiente privado do Render.
- `API_INTERNAL_HOSTPORT`: endereço privado da API passado ao painel.
- `NEXT_PUBLIC_ODOO_URL`: URL pública do Odoo; pode ser visível no navegador e não deve conter segredo.
- Não registrar valores de segredos no GitHub, logs, screenshots ou documentação. Fazer rotação pelo Render e validar impacto antes.

O seed cria a empresa demo `era-demo` e o usuário `admin@era.local` a partir de `SEED_PASSWORD`. É idempotente, mas não troca senha de usuário já existente. Essa identidade é do protótipo ERA, não autentica automaticamente no Odoo.

## Limites e próximos controles

O serviço `era-admin` usa plano Free; pode apresentar suspensão/reativação ou limitações de recursos conforme política atual do Render. O serviço API e o PostgreSQL são pagos, conforme planos no painel. O custo total deve ser lido no billing do workspace, não inferido de estimativas antigas.

Não há worker nem Redis/Key Value provisionado nesta configuração Render; a outbox está no código. Manter volume baixo e não tratar mensagens como processadas só porque foram enfileiradas. Banco não deve receber conexão pública; não abrir allowlist para consultar diretamente os dados do Odoo.

Referência Blueprint: https://render.com/docs/blueprint-spec
