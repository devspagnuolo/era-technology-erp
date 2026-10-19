# Superadmin ERA e gestão de empresas

O endereço `https://erp.eratechnology.com.br/` é o login global do proprietário. O painel fica em `/platform`. Cada empresa continua acessando `/<slug>` com sua própria conta ERA. A conta global não é uma conta Odoo nem entra automaticamente em uma empresa.

## O que esta mudança implementa

- Login global por e-mail e senha, sem campo Empresa, autenticado pela API privada ERA.
- Sessão separada em cookie `HttpOnly`, `Secure` em produção e `SameSite=Strict`, válida por oito horas. A assinatura usa `PLATFORM_SESSION_SECRET`; rotacioná-lo invalida todas as sessões globais.
- Proteção de origem em todas as operações que alteram estado, limite local de tentativas de login e mensagens genéricas para credenciais inválidas.
- Painel que lista empresas e seus administradores iniciais, cria empresa e administrador em uma transação, edita nome, suspende e reativa o acesso.
- Suspensão revoga sessões ERA existentes e impede novos logins/renovações pela verificação atual de `tenant.active`.
- Auditoria de criação, edição, suspensão e reativação no `AuditLog` do tenant alvo.
- Slug único, minúsculo e imutável; rotas reservadas não podem ser usadas como slug.

## Variáveis privadas no Render

Serviço: `era-api`. Configurar no painel **Environment**; não colocar valores secretos no repositório.

| Chave | Valor |
| --- | --- |
| `PLATFORM_ADMIN_EMAIL` | `rafaelspagnuologarcia@gmail.com` |
| `PLATFORM_ADMIN_PASSWORD` | O proprietário insere depois, diretamente no Render. Até existir, o login global fica desabilitado. |
| `PLATFORM_SESSION_SECRET` | Valor aleatório com pelo menos 32 caracteres, separado de `JWT_SECRET`. |

As três chaves devem estar presentes no serviço de API. Ao salvar/alterar a senha, implantar a configuração. Não usar a senha ERA da empresa demo nem credenciais do Odoo como senha global. A senha fica somente no ambiente privado do Render.

## Operação

1. Acessar `/` e autenticar com o e-mail do proprietário.
2. Em **Nova empresa**, preencher nome, identificador, administrador inicial e senha inicial com pelo menos 12 caracteres. A senha inicial é enviada apenas para criar o hash do administrador e não aparece na listagem.
3. O administrador poderá entrar em `/<slug>` no ERA. O tenant não é provisionado automaticamente no Odoo; mapear sua empresa Odoo separadamente antes de habilitar módulos operacionais.
4. **Suspender** bloqueia login e sessões ERA da empresa; **Reativar** restaura a possibilidade de login, sem criar nova conta.
5. Para trocar a senha global, atualizar `PLATFORM_ADMIN_PASSWORD` no Render. Para encerrar sessões globais, rotacionar `PLATFORM_SESSION_SECRET`.

## Limites e próximos controles

O painel gerencia cadastro e acesso ERA. Não implementa cobrança, contratos financeiros, provisionamento Odoo, e-mail de convite ou recuperação de senha. O limite de tentativas é por instância; antes de uso comercial com clientes reais, adicionar limite distribuído, MFA do proprietário, teste de backup/restauração e revisão de isolamento Odoo. O painel lista até 200 tenants; paginação será necessária ao crescer.

Não inserir senhas, chaves ou dados operacionais de clientes no GitHub. O banco ERA e Odoo continuam separados. Odoo mantém a fonte dos dados operacionais e suas próprias permissões multiempresa.


## Painel de gestão ampliado

O painel oferece visão gerencial com total de empresas, acessos ativos e suspensos, usuários ERA habilitados e sessões ainda válidas. A listagem permite localizar clientes por nome, endereço e e-mail do administrador, filtrar por situação e executar edição ou suspensão/reativação. O resumo também mostra os cadastros mais recentes e até 12 eventos de auditoria administrativa, com empresa, ator e horário.

Os indicadores são calculados a partir do banco ERA no momento da consulta. “Banco ERA consultado” significa que a leitura do painel conseguiu consultar esses registros. Não representa monitoramento contínuo, disponibilidade do Odoo ou SLA.

A plataforma ainda não mantém dados de contrato, cobrança, receita, planos ou uso de recursos Odoo. Esses indicadores não são apresentados como se fossem dados reais. Devem ser incorporados após definir a fonte e o fluxo comercial.

O painel também consulta a versão do servidor Odoo pela integração configurada e indica se a conexão está conectada, não configurada ou indisponível. Essa consulta é pontual ao abrir/atualizar a visão gerencial; não é um monitor contínuo nem substitui alertas de disponibilidade.
