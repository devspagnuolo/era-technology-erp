# Integração ERA ↔ Odoo

A ERA é a interface; o Odoo é o motor e a fonte oficial dos registros. A tela ERA lê e grava no Odoo pela API externa (JSON-RPC) do próprio Odoo. A ERA não guarda cópia dos cadastros operacionais.

```text
Navegador → painel ERA (/v1) → API ERA ──JSON-RPC──→ Odoo
                                  │                    └ banco do Odoo (fonte oficial)
                                  └→ PostgreSQL ERA (login, permissões, auditoria)
```

## Como funciona

- A API ERA autentica no Odoo com um **usuário técnico** e uma **chave de API** do Odoo. A chave fica só no ambiente da API; o navegador nunca a recebe.
- Cada empresa ERA (slug do login) é vinculada a uma empresa Odoo (`res.company`) em `ODOO_TENANT_COMPANIES`. Toda leitura e gravação usa somente essa empresa; empresa ERA sem vínculo não acessa dados do Odoo.
- As permissões ERA (`products:*`, `contacts:*`, `sales:*`) decidem o que cada pessoa pode fazer na tela. O usuário técnico do Odoo limita o que a integração inteira pode fazer.
- Cada criação, edição ou arquivamento é registrado na auditoria ERA com antes/depois e o identificador `<modelo>:<id>` (ex.: `sale.order:12`). Em vendas, confirmar, cancelar e reabrir também são registrados.
- Erros de regra do Odoo (validação, acesso) aparecem para o usuário; erros internos aparecem como mensagem genérica.

## Módulos já integrados

| Área | Modelo Odoo | ERA |
|---|---|---|
| Produtos | `product.template` | consultar, buscar (nome, SKU, código de barras), cadastrar, editar, arquivar/restaurar; categoria e unidade vêm do Odoo; estoque disponível quando o Inventário está instalado |
| Clientes e fornecedores | `res.partner` | consultar, buscar (nome, CPF/CNPJ, e-mail, telefone), filtrar clientes/fornecedores, cadastrar, editar, arquivar/restaurar; CPF/CNPJ único por empresa; papéis de cliente/fornecedor exigem o Faturamento (`account`) |
| Vendas | `sale.order` | listar e buscar (número, cliente, referência), filtrar orçamentos/pedidos/cancelados, criar e editar orçamentos com itens, confirmar pedido, cancelar e voltar para orçamento; preços, impostos e totais calculados pelo Odoo; pedidos confirmados não são editados na ERA |

Rotas: `GET /v1/odoo/status` (qualquer usuário autenticado), `GET|POST /v1/odoo/sales`, `GET /v1/odoo/sales/options`, `GET|PATCH /v1/odoo/sales/:id`, `POST /v1/odoo/sales/:id/confirm|cancel|reopen`, `GET|POST /v1/odoo/contacts`, `PATCH /v1/odoo/contacts/:id`, `GET /v1/odoo/products`, `GET /v1/odoo/products/options`, `POST /v1/odoo/products`, `PATCH /v1/odoo/products/:id`.

## Configurar no Odoo publicado

1. Instalar o aplicativo **Inventário** (`stock`), que traz Produtos. A POC atual só tem `base`, `l10n_br_base` e `era_connector`.
2. Criar o usuário técnico (ex.: `era-integracao`) com acesso à empresa desejada e aos grupos *Inventário / Administrador* e *Vendas / Administrador* (ou o mínimo necessário). No Odoo da POC isso é feito por `odoo/provision_integration.py` a cada deploy.
3. Entrar como esse usuário → Preferências → Segurança da conta → **Nova chave de API**. Usuários comuns precisam de data de expiração; anote a data para rotacionar.
4. No Render, serviço `era-api`, preencher `ODOO_DB`, `ODOO_LOGIN`, `ODOO_API_KEY` e `ODOO_TENANT_COMPANIES` (ex.: `era-demo:1`). `ODOO_URL` já aponta para o Odoo da POC.

Sem essas variáveis, a tela de produtos explica o que falta, sem quebrar o restante do painel.

## Teste local

```sh
docker compose -f odoo/docker-compose.poc.yml up   # ou um container odoo:18.0 com o módulo stock
```

O teste `tests/odoo.integration.test.ts` roda contra um Odoo de teste quando `TEST_ODOO_URL`, `TEST_ODOO_DB`, `TEST_ODOO_LOGIN`, `TEST_ODOO_API_KEY` e `TEST_ODOO_COMPANIES` (duas empresas, ex.: `a:1,b:2`) estão definidas. Ele valida criação, busca, isolamento entre empresas, SKU duplicado, edição, arquivamento e auditoria. Nunca apontar para o Odoo de produção.

## Limites conhecidos

- SKU único por empresa é verificado pela ERA antes de gravar; duas gravações simultâneas com o mesmo SKU ainda podem passar, porque o Odoo não impõe essa unicidade.
- Em vendas, a ERA mostra a moeda da empresa Odoo; impostos seguem a configuração fiscal do Odoo.
- Produtos e contatos compartilhados entre empresas (sem empresa no Odoo) não aparecem na ERA; endereços filhos de um contato também não.
- O catálogo antigo da API ERA (`/v1/products`, PostgreSQL ERA) continua no código como protótipo e não é usado pela tela.

## Próximos módulos

Seguir o mesmo padrão (`OdooScope` + tela ERA + auditoria + teste contra Odoo): compras (`purchase.order`), movimentações e saldos de estoque, contas a receber/pagar (`account.move`).
