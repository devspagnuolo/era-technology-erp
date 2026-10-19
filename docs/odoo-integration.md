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
- As permissões ERA (`products:*`, `contacts:*`, `sales:*`, `purchases:*`, `inventory:*`, `invoices:*`, `crm:*`, `manufacturing:*`, `projects:*`, `employees:*`, `maintenance:*`, `timeoff:*`, `expenses:*`) decidem o que cada pessoa pode fazer na tela. O usuário técnico do Odoo limita o que a integração inteira pode fazer.
- Cada criação, edição ou arquivamento é registrado na auditoria ERA com antes/depois e o identificador `<modelo>:<id>` (ex.: `sale.order:12`). Em vendas, confirmar, cancelar e reabrir também são registrados.
- Erros de regra do Odoo (validação, acesso) aparecem para o usuário; erros internos aparecem como mensagem genérica.

## Formulários completos

A ERA não mantém lista fixa de campos. Cada cadastro usa a própria tela de formulário do Odoo (`get_views`), então tudo o que os módulos instalados acrescentam (inclusive a localização brasileira: dados fiscais, NCM, CEST, endereço) aparece na ERA:

- `services/api/src/odoo-form.ts` lê a tela e monta o esquema: abas (`page`), grupos, campos obrigatórios, somente leitura e ocultos (inclusive as condições do Odoo 17+, avaliadas por `packages/shared/odoo-expr.ts` na API e no painel), listas de itens (`one2many`) com suas colunas e a ajuda de campo que o Odoo fornece. A ERA exibe esse texto abaixo do campo; se o Odoo não definir ajuda, a ERA não inventa uma explicação específica.
- Valores padrão, recálculos (preço, impostos, descrição do item) e listas de opções vêm do Odoo: `onchange` e `name_search` com o domínio da tela, sempre restritos à empresa vinculada.
- A gravação aceita só campos presentes na tela, ignora os somente leitura, transforma itens em comandos do Odoo e confere que registros relacionados pertencem à empresa.
- `services/api/src/odoo-records.ts` junta isso por modelo; cada módulo só declara o modelo, campos que a ERA esconde (empresa) e regras próprias (SKU único, CPF/CNPJ único, papéis).
- Campos que a tela do Odoo mantém sempre ocultos (ex.: a descrição interna do item de estoque) acompanham o registro sem aparecer: o Odoo os preenche no recálculo e eles são gravados, como faz o próprio Odoo.
- A etapa clicável do cabeçalho (ex.: estágio da oportunidade, etapa da tarefa) vira um campo comum do formulário, no grupo "Etapa"; botões e situações fixas do cabeçalho ficam de fora.
- Período com `widget="daterange"` (ex.: datas da folga): a data final indicada em `end_date_field` aparece logo depois da inicial, como no calendário do Odoo.
- Módulos mais simples são só configuração: `services/api/src/odoo-app.ts` (lista, filtros, formulário, resumo e ações do Odoo; rotas geradas por `appController`) e `apps/admin/src/components/odoo-app.tsx` (tela). CRM, Fabricação, Projeto, Funcionários, Manutenção, Folga e Despesas usam esse padrão. O campo de empresa usado no recorte pode ser outro (`company: { field, write }`; a folga usa a empresa do funcionário, preenchida pelo Odoo).
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
| Faturas | `account.move` | faturas e notas de crédito de clientes (a receber) e contas e reembolsos de fornecedores (a pagar): listar, filtrar (rascunhos, em aberto, pagas, canceladas) e buscar (número, parceiro, referência); criar e editar com o formulário completo da fatura do Odoo (itens, impostos, condições de pagamento, posição fiscal, tipo de documento fiscal); confirmar, registrar pagamento do saldo (diário e forma padrão do Odoo), voltar para rascunho e cancelar. Lançamentos contábeis avulsos ficam no Odoo |
| CRM | `crm.lead` | oportunidades: listar (em andamento, ganhas, perdidas) e buscar (nome, cliente, contato, e-mail); formulário completo do Odoo (dados da empresa com CNPJ/IE da localização, contato, vendedor, equipe, etapa do funil, marcadores, origem e campanha); marcar como ganha, perdida (motivo opcional) e reabrir |
| Fabricação | `mrp.production` | ordens de produção: listar por situação e buscar (número, produto, origem); formulário completo (produto, lista de materiais, quantidades, componentes, operação); confirmar, verificar disponibilidade, concluir (o Odoo consome os componentes e dá entrada no produto) e cancelar. Backorder ou consumo divergente: concluir no Odoo |
| Projeto | `project.project`, `project.task` | projetos (cliente, responsável, datas, visibilidade, e-mail) com arquivar/reativar; tarefas por projeto com etapa, responsáveis, prazo, marcadores e subtarefas; concluir, cancelar e reabrir tarefas |
| Funcionários | `hr.employee` | cadastro completo (trabalho, currículo e competências, informações profissionais e pessoais, definições de RH); desligar (arquivar) e reativar |
| Manutenção | `maintenance.request`, `maintenance.equipment` | solicitações (equipamento, tipo, equipe, técnico, agenda, etapa clicável) e equipamentos (categoria, uso, fornecedor, modelo, série, garantia, preventiva); arquivar e reabrir solicitações, arquivar e reativar equipamentos |
| Folga | `hr.leave` | pedido completo (funcionário, tipo, período em dias, meio período ou horas, motivo); o Odoo calcula a duração e o saldo; aprovar (inclusive dupla aprovação), recusar e voltar para aprovação |
| Despesas | `hr.expense`, `hr.expense.sheet` | despesa completa (categoria, total ou preço × quantidade, impostos, pago por, conta analítica); criar relatório, enviar, aprovar, contabilizar e registrar o reembolso |

Rotas: `GET /v1/odoo/status` (qualquer usuário autenticado). Para cada módulo (`products`, `contacts`, `sales`, `purchases`, `transfers`, `invoices`, `crm`, `manufacturing`, `projects`, `tasks`, `employees`, `maintenance`, `equipment`, `time-off`, `expenses`, `expense-reports`): `GET /v1/odoo/<módulo>` (lista), `GET /v1/odoo/<módulo>/form` (esquema e valores padrão de um novo registro), `GET /v1/odoo/<módulo>/:id/form`, `POST /v1/odoo/<módulo>/onchange[?id=]` (recálculo do Odoo), `POST /v1/odoo/<módulo>/lookup` (opções de um campo), `POST /v1/odoo/<módulo>` e `PATCH /v1/odoo/<módulo>/:id` (corpo `{ "values": {...}, "extra": {...} }`; `{ "active": false }` arquiva). Vendas e compras também têm `POST /v1/odoo/<módulo>/:id/confirm|cancel|reopen` (permissão `<módulo>:confirm`; reabrir usa `<módulo>:update`). Estoque tem `GET /v1/odoo/transfers/form?kind=incoming|outgoing|internal` e `POST /v1/odoo/transfers/:id/confirm|assign|validate|cancel` (permissão `inventory:validate`). Faturas tem `GET /v1/odoo/invoices/form?side=customer|vendor&refund=0|1` e `POST /v1/odoo/invoices/:id/post|pay|draft|cancel` (permissão `invoices:post`); ao criar, o tipo da fatura vai em `extra.move_type`. CRM, Fabricação e tarefas têm `POST /v1/odoo/<módulo>/:id/<ação>` (CRM `won|lost|reopen`, com `{ "lostReasonId" }` opcional; Fabricação `confirm|assign|done|cancel`, permissão `manufacturing:produce`; tarefas `done|cancel|reopen`) e filtro `?filter=`; tarefas aceitam `?project=<id>` na lista e no novo formulário. Manutenção tem `POST /v1/odoo/maintenance/:id/archive|reopen` (`maintenance:update`); Folga `POST /v1/odoo/time-off/:id/approve|refuse|reset` (`timeoff:approve`); Despesas `POST /v1/odoo/expenses/:id/submit` (`expenses:approve`, cria o relatório) e `POST /v1/odoo/expense-reports/:id/submit|approve|post|pay|reset` (`expenses:approve`).

## Configurar no Odoo publicado

1. O banco Odoo da POC é inicializado por padrão somente com `base`, `l10n_br_base` e `era_connector`; as telas operacionais dependem da instalação dos aplicativos Community correspondentes. Para a cobertura documentada, instalar e validar os aplicativos aplicáveis: Inventário (`stock`), Vendas (`sale_management`), Compras (`purchase`), Faturamento (`account`), CRM (`crm`), Fabricação (`mrp`), Projeto (`project`), Funcionários (`hr`), Manutenção (`maintenance`), Folga (`hr_holidays`) e Despesas (`hr_expense`). Os formulários fiscais brasileiros também dependem dos módulos OCA compatíveis com Odoo 18 presentes no caminho de addons e de sua instalação/configuração. Instalar em Odoo Community não habilita recursos exclusivos do Enterprise.
2. Criar o usuário técnico (ex.: `era-integracao`) com acesso à empresa desejada e aos grupos *Inventário / Administrador*, *Vendas / Administrador*, *Compras / Administrador*, *Faturamento / Administrador*, *Fiscal / Gerente*, *Fabricação / Administrador*, *Projeto / Administrador*, *Funcionários / Administrador*, *Manutenção / Gerente de equipamentos*, *Folga / Administrador* e *Despesas / Administrador* (sem eles, o Odoo esconde as abas desses módulos). O usuário técnico precisa de um e-mail (o Odoo exige autor com e-mail nas mensagens que as ações registram no histórico). No Odoo da POC isso é feito por `odoo/provision_integration.py` a cada deploy.
3. Entrar como esse usuário → Preferências → Segurança da conta → **Nova chave de API**. Usuários comuns precisam de data de expiração; anote a data para rotacionar.
4. No Render, serviço `era-api`, preencher `ODOO_DB`, `ODOO_LOGIN`, `ODOO_API_KEY` e `ODOO_TENANT_COMPANIES` (ex.: `era-demo:1`). `ODOO_URL` já aponta para o Odoo da POC.

Sem essas variáveis, a tela de produtos explica o que falta, sem quebrar o restante do painel.

## Teste local

```sh
docker compose -f odoo/docker-compose.poc.yml up   # ou um container odoo:18.0 com o módulo stock
```

O teste `tests/odoo.integration.test.ts` roda contra um Odoo de teste quando `TEST_ODOO_URL`, `TEST_ODOO_DB`, `TEST_ODOO_LOGIN`, `TEST_ODOO_API_KEY` e `TEST_ODOO_COMPANIES` (duas empresas, ex.: `a:1,b:2`) estão definidas. Sem essas variáveis, os casos são ignorados: um CI verde não comprova a conexão ao Odoo. A suíte cria e altera registros operacionais; usar exclusivamente banco descartável, nunca o Odoo de produção. Cobertura de CRUD de um conjunto de modelos também não prova paridade de cada ação/tela de todos os aplicativos.

## Limites conhecidos

- SKU único por empresa é verificado pela ERA antes de gravar; duas gravações simultâneas com o mesmo SKU ainda podem passar, porque o Odoo não impõe essa unicidade.
- Em vendas, a ERA mostra a moeda da empresa Odoo; impostos seguem a configuração fiscal do Odoo.
- Produtos e contatos compartilhados entre empresas (sem empresa no Odoo) não aparecem na ERA; endereços filhos de um contato também não.
- O catálogo antigo da API ERA (`/v1/products`, PostgreSQL ERA) continua no código como protótipo e não é usado pela tela.

## Todos os aplicativos (motor genérico)

Além das telas próprias acima, a ERA abre **qualquer aplicativo instalado no Odoo** sem que o usuário entre no Odoo. Código: `services/api/src/odoo-runtime.ts` (API em `/v1/odoo/run/...`), `services/api/src/odoo-pyval.ts` (avalia domínios e contextos que o Odoo guarda como texto Python) e `apps/admin/src/components/odoo-run.tsx` (tela).

- **Menus**: `GET /v1/odoo/run/menus` lê os menus do Odoo (`ir.ui.menu.load_menus`) e a ERA desenha a grade de aplicativos e, dentro de cada um, os menus e submenus do Odoo.
- **Listas**: `GET /v1/odoo/run/action/:id` traduz a ação do menu; `GET /v1/odoo/run/list?action=&q=&filters=&page=` usa a lista e a busca do próprio Odoo (colunas, filtros, filtros padrão da ação).
- **Formulários, botões e assistentes**: `GET|POST /v1/odoo/run/m/<modelo>/<chave>/...` (formulário completo, recálculo, opções de campo, criar, editar, botões do cabeçalho, assistentes, arquivar, excluir, histórico e mensagens). Só botões que o formulário do Odoo exibe podem ser acionados.
- **Relatórios em PDF**: `GET /v1/odoo/run/report/<relatório>?ids=`; a API abre uma sessão web no Odoo com `ODOO_PASSWORD` (se definida) ou com a chave de API.
- **Loja de aplicativos**: `GET /v1/odoo/run/apps` e `POST /v1/odoo/run/apps/:id/install|upgrade|uninstall`.
- **Configurações**: o formulário `res.config.settings` de todos os aplicativos, salvo pela ERA.
- **Menu lateral e central de módulos**: cada aplicativo instalado entra sozinho no grupo da categoria que o Odoo dá ao módulo (Vendas, Contabilidade, Marketing, Site → Comercial e financeiro; Inventário, Fabricação, Serviços → Operações; Recursos Humanos → Pessoas; Produtividade → Produtividade; o resto → Outros aplicativos). Aplicativo instalado pela loja da ERA aparece no grupo certo sem mudar código; os itens fixos do menu indicam o aplicativo que já cobrem para não repetir.

Permissões: `odoo:read` (ver), `odoo:write` (criar, editar, botões, assistentes), `odoo:admin` (loja de aplicativos e configurações). Modelos técnicos (`ir.*`, `res.users`, `res.groups` etc.) ficam bloqueados: usuários e perfis são da ERA. O navegador nunca escolhe empresa, usuário ou idioma pelo contexto. Cada gravação e botão vai para a auditoria ERA (`odoo.run`).

O usuário técnico precisa do grupo *Configurações* (`base.group_system`) para ler menus e ações e instalar aplicativos; `odoo/provision_integration.py` concede.

Atenção:

- Instalar, remover aplicativos e mudar configurações vale para **todo o banco do Odoo**, ou seja, para todas as empresas ERA ligadas a ele. Por isso exige `odoo:admin`. A instalação roda dentro da requisição e pode levar alguns minutos.
- Antes de instalar módulos no banco local, apague a rota "Comprar" órfã: `delete from stock_route_product where route_id=5`.
- Registros sem empresa no Odoo (conversas, calendário, lista de tarefas, contatos compartilhados) aparecem para qualquer empresa ERA ligada ao mesmo Odoo. Com uma empresa por banco Odoo, isso não importa.
- Visões kanban, calendário, pivô e gráfico aparecem como lista. Painéis próprios do Odoo (ações de cliente, como Painéis em planilha) mostram um aviso; Conversas aparecem como lista de canais com histórico. Filtros com datas relativas (ex.: "este mês") não são exibidos. Links externos de ações (`act_url`) não são abertos.

Etapas que antes ficavam no Odoo (ex.: lotes e números de série na validação de estoque, backorder na fabricação) agora são feitas pelos assistentes em **Todos os aplicativos**.


O CI de 19/10/2026 passou em testes e build, mas não tinha variáveis `TEST_ODOO_*`; portanto, sua execução não validou chamadas ao Odoo. A página pública do Odoo respondeu com a tela de login, o que confirma apenas a disponibilidade HTTP do serviço. A verificação da integração com credenciais e dados permanece pendente até executar os cenários em um banco Odoo de teste isolado.
