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
- As permissões ERA (`products:read`, `products:create`, `products:update`) decidem o que cada pessoa pode fazer na tela. O usuário técnico do Odoo limita o que a integração inteira pode fazer.
- Cada criação, edição ou arquivamento é registrado na auditoria ERA com antes/depois e o identificador `product.template:<id>`.
- Erros de regra do Odoo (validação, acesso) aparecem para o usuário; erros internos aparecem como mensagem genérica.

## Módulos já integrados

| Área | Modelo Odoo | ERA |
|---|---|---|
| Produtos | `product.template` | consultar, buscar (nome, SKU, código de barras), cadastrar, editar, arquivar/restaurar; categoria e unidade vêm do Odoo; estoque disponível quando o Inventário está instalado |

Rotas: `GET /v1/odoo/status`, `GET /v1/odoo/products`, `GET /v1/odoo/products/options`, `POST /v1/odoo/products`, `PATCH /v1/odoo/products/:id`.

## Configurar no Odoo publicado

1. Instalar o aplicativo **Inventário** (`stock`), que traz Produtos. A POC atual só tem `base`, `l10n_br_base` e `era_connector`.
2. Criar o usuário técnico (ex.: `era-integracao`) com acesso à empresa desejada e ao grupo *Inventário / Administrador* (ou o mínimo necessário).
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
- Produtos compartilhados entre empresas (sem empresa no Odoo) não aparecem na ERA.
- O catálogo antigo da API ERA (`/v1/products`, PostgreSQL ERA) continua no código como protótipo e não é usado pela tela.

## Próximos módulos

Seguir o mesmo padrão (cliente Odoo + tela ERA + auditoria + teste contra Odoo): contatos (clientes/fornecedores, `res.partner`), pedidos de venda (`sale.order`), compras (`purchase.order`), movimentações e saldos de estoque, contas a receber/pagar (`account.move`).
