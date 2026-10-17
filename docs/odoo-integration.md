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
- As permissões ERA (`products:*`, `contacts:*`, `sales:*`, `purchases:*`, `inventory:*`) decidem o que cada pessoa pode fazer na tela. O usuário técnico do Odoo limita o que a integração inteira pode fazer.
- Cada criação, edição ou arquivamento é registrado na auditoria ERA com antes/depois e o identificador `<modelo>:<id>` (ex.: `sale.order:12`). Em vendas, confirmar, cancelar e reabrir também são registrados.
- Erros de regra do Odoo (validação, acesso) aparecem para o usuário; erros internos aparecem como mensagem genérica.

## Formulários completos

A ERA não mantém lista fixa de campos. Cada cadastro usa a própria tela de formulário do Odoo (`get_views`), então tudo o que os módulos instalados acrescentam (inclusive a localização brasileira: dados fiscais, NCM, CEST, endereço) aparece na ERA:

- `services/api/src/odoo-form.ts` lê a tela e monta o esquema: abas (`page`), grupos, campos obrigatórios, somente leitura e ocultos (inclusive as condições do Odoo 17+, avaliadas por `packages/shared/odoo-expr.ts` na API e no painel), listas de itens (`one2many`) com suas colunas.
- Valores padrão, recálculos (preço, impostos, descrição do item) e listas de opções vêm do Odoo: `onchange` e `name_search` com o domínio da tela, sempre restritos à empresa vinculada.
- A gravação aceita só campos presentes na tela, ignora os somente leitura, transforma itens em comandos do Odoo e confere que registros relacionados pertencem à empresa.
- `services/api/src/odoo-records.ts` junta isso por modelo; cada módulo só declara o modelo, campos que a ERA esconde (empresa) e regras próprias (SKU único, CPF/CNPJ único, papéis).
- Campos que a tela do Odoo mantém sempre ocultos (ex.: a descrição interna do item de estoque) acompanham o registro sem aparecer: o Odoo os preenche no recálculo e eles são gravados, como faz o próprio Odoo.
- O painel (`apps/admin/src/components/odoo-form.tsx` e `odoo-record-dialog.tsx`) desenha o formulário a partir do esquema.
- Campos que o Odoo esconde por falta de grupo não chegam à ERA. O usuário técnico precisa dos grupos dos módulos (veja abaixo); recursos desligados nas Configurações do Odoo (ex.: unidades de medida, variantes) continuam ocultos, como no Odoo.

## Módulos já integrados

| Área | Modelo Odoo | ERA |
|---|---|---|
| Produtos | `product.template` | consultar, buscar (nome, SKU, código de barras), arquivar/restaurar; cadastro completo com todas as abas do Odoo (geral, vendas, compras, inventário, fiscal); SKU único por empresa |
| Clientes e fornecedores | `res.partner` | consultar, buscar (nome, CPF/CNPJ, e-mail, telefone), filtrar clientes/fornecedores, arquivar/restaurar; cadastro completo do Odoo (endereço, fiscal, vendas e compras, contas); CPF/CNPJ único por empresa; papéis de cliente/fornecedor exigem o Faturamento (`account`) |
| Vendas | `sale.order` | listar e buscar (número, cliente, referência), filtrar orçamentos/pedidos/cancelados, criar e editar orçamentos com o formulário completo do Odoo (itens, condições, entrega, outras informações) e recálculo ao vivo, confirmar pedido, cancelar e voltar para orçamento; preços, impostos e totais calculados pelo Odoo; pedidos confirmados não são editados na ERA |
| Compras | `purchase.order` | listar e buscar (número, fornecedor, referência do fornecedor), filtrar solicitações de cotação/pedidos/cancelados, criar e editar com o formulário completo do Odoo (itens, chegada prevista, condições, incoterm), confirmar pedido, cancelar e voltar para cotação; preço inicial do item vem do custo ou da tabela do fornecedor no Odoo; pedidos que exigem aprovação aparecem como "Aguardando aprovação" |
| Estoque | `stock.picking` | recebimentos, entregas e transferências internas: listar por tipo, filtrar (a fazer, rascunho, aguardando, prontas, concluídas, canceladas) e buscar (referência, contato, origem); criar e editar com o formulário completo do Odoo (operações, informações adicionais, observação); marcar como a fazer, verificar disponibilidade, validar e cancelar. O Odoo reserva o estoque e atualiza os saldos; o que faltar na validação vira pendência (backorder), como no padrão do Odoo. Etapas que pedem assistente no Odoo (ex.: lotes e números de série) devem ser concluídas no Odoo |

Rotas: `GET /v1/odoo/status` (qualquer usuário autenticado). Para cada módulo (`products`, `contacts`, `sales`, `purchases`, `transfers`): `GET /v1/odoo/<módulo>` (lista), `GET /v1/odoo/<módulo>/form` (esquema e valores padrão de um novo registro), `GET /v1/odoo/<módulo>/:id/form`, `POST /v1/odoo/<módulo>/onchange[?id=]` (recálculo do Odoo), `POST /v1/odoo/<módulo>/lookup` (opções de um campo), `POST /v1/odoo/<módulo>` e `PATCH /v1/odoo/<módulo>/:id` (corpo `{ "values": {...}, "extra": {...} }`; `{ "active": false }` arquiva). Vendas e compras também têm `POST /v1/odoo/<módulo>/:id/confirm|cancel|reopen` (permissão `<módulo>:confirm`; reabrir usa `<módulo>:update`). Estoque tem `GET /v1/odoo/transfers/form?kind=incoming|outgoing|internal` e `POST /v1/odoo/transfers/:id/confirm|assign|validate|cancel` (permissão `inventory:validate`).

## Configurar no Odoo publicado

1. Instalar o aplicativo **Inventário** (`stock`), que traz Produtos. A POC atual só tem `base`, `l10n_br_base` e `era_connector`.
2. Criar o usuário técnico (ex.: `era-integracao`) com acesso à empresa desejada e aos grupos *Inventário / Administrador*, *Vendas / Administrador*, *Compras / Administrador*, *Faturamento / Administrador* e *Fiscal / Gerente* (sem eles, o Odoo esconde as abas desses módulos). No Odoo da POC isso é feito por `odoo/provision_integration.py` a cada deploy.
3. Entrar como esse usuário → Preferências → Segurança da conta → **Nova chave de API**. Usuários comuns precisam de data de expiração; anote a data para rotacionar.
4. No Render, serviço `era-api`, preencher `ODOO_DB`, `ODOO_LOGIN`, `ODOO_API_KEY` e `ODOO_TENANT_COMPANIES` (ex.: `era-demo:1`). `ODOO_URL` já aponta para o Odoo da POC.

Sem essas variáveis, a tela de produtos explica o que falta, sem quebrar o restante do painel.

## Teste local

```sh
docker compose -f odoo/docker-compose.poc.yml up   # ou um container odoo:18.0 com o módulo stock
```

O teste `tests/odoo.integration.test.ts` roda contra um Odoo de teste quando `TEST_ODOO_URL`, `TEST_ODOO_DB`, `TEST_ODOO_LOGIN`, `TEST_ODOO_API_KEY` e `TEST_ODOO_COMPANIES` (duas empresas, ex.: `a:1,b:2`) estão definidas. Ele valida o formulário completo, criação, recálculo de itens, busca, isolamento entre empresas, SKU duplicado, edição, arquivamento e auditoria. Nunca apontar para o Odoo de produção.

## Limites conhecidos

- SKU único por empresa é verificado pela ERA antes de gravar; duas gravações simultâneas com o mesmo SKU ainda podem passar, porque o Odoo não impõe essa unicidade.
- Em vendas, a ERA mostra a moeda da empresa Odoo; impostos seguem a configuração fiscal do Odoo.
- Produtos e contatos compartilhados entre empresas (sem empresa no Odoo) não aparecem na ERA; endereços filhos de um contato também não.
- O catálogo antigo da API ERA (`/v1/products`, PostgreSQL ERA) continua no código como protótipo e não é usado pela tela.

## Próximos módulos

Seguir o mesmo padrão (`OdooRecords` com o formulário completo + tela ERA + auditoria + teste contra Odoo): faturas e contas a receber/pagar (`account.move`).
