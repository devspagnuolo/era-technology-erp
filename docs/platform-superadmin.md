# Acesso superadministrador ERA e gestão de empresas

## Objetivo

Disponibilizar um acesso global do proprietário em `https://erp.eratechnology.com.br/`, sem informar empresa, e um painel administrativo ERA para gerir os tenants que contratam o ERP. Esse acesso é distinto do login operacional de cada empresa (`/<slug>`) e não deve herdar permissões ou dados de um tenant.

## Estado atual

Na versão atual documentada, a autenticação ERA é tenant-scoped: o usuário informa o identificador público da empresa; o JWT/sessão inclui `tenantId`; a autorização consulta sessão e permissões. A arquitetura não tem papel global superadmin. O caminho `/<slug>` é login de empresa e permanece inalterado. O login ERA continua separado do login Odoo, e o Odoo continua mestre dos registros operacionais.

## Rotas pretendidas

- `GET /`: login do proprietário, sem campo Empresa.
- `POST /v1/platform/auth/login`: autenticação exclusiva do superadmin.
- `GET /platform`: painel protegido de administração da plataforma.
- `GET /platform/companies`: listar/filtrar empresas contratantes.
- `POST /platform/companies`: cadastrar novo tenant/empresa e seu slug.
- `PATCH /platform/companies/:id`: editar dados administrativos e status.
- `POST /platform/companies/:id/suspend` e `/activate`: suspender/reativar acesso sem apagar dados.
- `GET /:slug`: autenticação tenant-scoped existente, sem mudança de semântica.

Não usar a rota raiz para entrar automaticamente em uma empresa, nem permitir que um administrador de empresa acesse `/platform`.

## Modelo e escopo

Criar identidade de plataforma separada da tabela de usuários tenant, por exemplo `PlatformAdmin` (email único, hash forte de senha, MFA habilitável, estado e timestamps) e sessão/tokens de plataforma separados. Claims de plataforma não devem conter tenantId escolhido pelo cliente. Autorizações de plataforma devem ser explicitamente verificadas por guards próprios; não aceitar papel, tenantId ou permissões vindos do corpo do navegador.

Empresas geridas no painel correspondem ao Tenant existente. Reutilizar Tenant e relações existentes em vez de duplicar empresa operacional; armazenar no perfil administrativo apenas dados necessários à contratação/onboarding (nome, slug imutável/único, contato administrativo, status, datas e observação operacional restrita). Não armazenar dados de pagamento ou cartão no protótipo. Status suspenso deve bloquear novas sessões e revogar sessões ativas do tenant de forma transacional, sem excluir registros.

A sessão global precisa ser isolada das sessões de tenant (cookie/token, issuer/audience, chaves/segredos e guard). Recomendação: cookie HttpOnly, Secure, SameSite=Strict para plataforma; proteção CSRF nas mutações; limite de tentativas e atraso progressivo no login. Nunca colocar token em localStorage ou credenciais em `NEXT_PUBLIC_*`. Senhas devem usar algoritmo moderno de hash já adotado/compatível no backend e reset por fluxo controlado. Nunca criar senha padrão, segredo fixo, credencial em código ou seed público. MFA é requisito antes de uso comercial com dados reais; manter auditoria imutável das ações administrativas, sem registrar segredos.

## Segurança multiempresa

- Não adicionar uma rota que liste dados operacionais ou usuários entre empresas.
- Painel inicial mostra apenas metadados administrativos necessários (empresa, slug, status, contato, criação/último acesso administrativo se disponível).
- Todas as operações por empresa são autorizadas por guard de plataforma; endpoints tenant existentes continuam usando tenant da sessão, nunca tenant do parâmetro/body.
- Suspender tenant impede login e refresh, revoga sessões e não apaga dados.
- Slug deve validar formato, ser único case-insensitive e reservar nomes de sistema, `platform`, `admin`, `api`, `v1`, `docs`, `login`, `health`.
- Auditar criar/editar/suspender/reativar tenant com ator, horário, alvo e campos alterados; ocultar dados sensíveis.
- Testes negativos obrigatórios: tenant user não acessa plataforma; plataforma não obtém sessão tenant implicitamente; IDs de outro tenant não podem ser usados em APIs tenant; tenant suspenso não pode autenticar/renovar; token tenant não serve em guard plataforma e vice-versa.

## Implantação e bootstrap

1. Implementar schema/migração, API e interface em branch separada; manter o login atual por slug.
2. Adicionar variáveis secretas no Render manualmente ou por mecanismo seguro:
   - `PLATFORM_ADMIN_EMAIL`: e-mail inicial do proprietário.
   - `PLATFORM_ADMIN_PASSWORD_HASH` ou fluxo de bootstrap de uso único: nunca senha em claro.
   - Segredo/chaves de sessão de plataforma independentes dos tokens tenant.
   Segredos não devem ser commitados. Preferir bootstrap de uso único que force troca de senha e configuração de MFA; não deixar segredo de provisionamento ativo após uso.
3. Rodar migração compatível e backup validado antes de ativar. Verificar rollback e recuperação; não sincronizar Blueprint automaticamente caso crie/alterne serviços ou gere custo.
4. Executar CI (testes, build, lint/typecheck) e revisão de segurança; deploy em Render após aprovação.
5. Configurar conta do proprietário e MFA fora do GitHub; testar login global e caminhos por tenant.
6. Definir política operacional de recuperação de acesso e registro de auditoria.

## Critérios de aceite

- `/` apresenta login sem seletor/campo de empresa e não revela se um email existe.
- Superadmin autentica na raiz e chega ao painel; usuário tenant não consegue autenticar nem acessar essas rotas.
- Painel permite listar, cadastrar, editar dados administrativos e suspender/reativar empresas sem exclusão de dados.
- Login tenant em `/<slug>` continua funcionando e recebe apenas o tenant correspondente.
- Sessões, permissões e segredos são separados; ações administrativas auditadas.
- Testes de autorização, isolamento, validação de slug, status de tenant e sessão expirada passam.
- Nenhuma senha, chave ou dado real de cliente aparece no repositório.

## Fora do escopo desta etapa

Faturamento/cobrança automática, provisionamento de banco isolado por cliente, SSO para Odoo, plano comercial e integração automática com gateway de pagamento. A gestão inicial controla o cadastro/status do tenant ERA; acesso e dados operacionais do Odoo precisam de provisionamento e isolamento multiempresa próprio, a configurar e validar separadamente.

## Decisões/segredos pendentes do proprietário

- E-mail do superadministrador (usar o e-mail corporativo desejado).
- Configuração de MFA e canal seguro de recuperação.
- Confirmação do fluxo de domínio/tenant: rota `/<slug>` já é a decisão adotada; domínios dedicados de cliente ficam para fase futura.
- Processo comercial que define quando ativar/suspender um contrato.
- Dados mínimos de contato e política de retenção.
