# Arquitetura e limites atuais

Estado documentado em 17/10/2026. O diagrama lógico, não a separação de domínios comerciais, orienta a implementação.

## Decisão de produto e fonte da verdade

Odoo Community é o motor das operações do ERP. O Odoo deve ser o sistema mestre de contatos, CRM, vendas, compras, inventário, faturamento e demais registros operacionais já cobertos por seus módulos.

A ERA é a camada de experiência: identidade visual própria, painel inicial, navegação mais simples e administração auxiliar em evolução. A central lista 19 áreas do menu existente do Odoo. Atualmente os cartões abrem o seletor de aplicativos em outra aba; selecionar o módulo ainda é uma ação dentro do Odoo.

```text
Pessoa → interface ERA (Next.js) ── menu/atalhos ──→ Odoo Community
             │                                      └→ banco próprio do Odoo
             └→ API ERA (NestJS) → PostgreSQL ERA
                  autenticação/autorizações auxiliares
```

Não existe integração servidor-a-servidor com Odoo, sincronização de cadastros, deep-link garantido por módulo nem SSO. Não compartilhar a senha de usuário Odoo com a API ERA. Não conectar diretamente ao PostgreSQL do Odoo nem abrir sua allowlist de rede como substituto de uma API autorizada.

A API e o banco ERA são um protótipo independente de administração/autenticação e ainda contêm endpoints de catálogo de demonstração. Esse catálogo não é o cadastro oficial de produtos e não deve ser usado para operar o ERP. Não ampliar módulos duplicados de CRM, vendas ou estoque na API ERA até que a arquitetura de integração ou migração seja deliberadamente definida.

## Estrutura técnica existente

Monorepo modular: `apps/admin` (Next.js), `services/api` (NestJS), `services/worker` (BullMQ), `packages/database` (Prisma) e `packages/shared` (contratos). PDV e portal não foram implementados.

O navegador chama `/v1` no domínio do painel; um proxy Next encaminha a chamada para a API privada. `API_INTERNAL_HOSTPORT` é interna. A API usa `DATABASE_URL` para o PostgreSQL dedicado à ERA. O Odoo mantém seu próprio serviço e banco, sem dependência de leitura ou escrita pela API ERA.

## Autenticação e isolamento na API ERA

O usuário ERA informa o identificador público da empresa. A API valida a conta nesse tenant e cria sessão. JWT contém `tenantId`, `sub` e `sid`, validade de 15 minutos, issuer/audience fixos. Sessão e permissões atuais são consultadas a cada requisição. O corpo HTTP não define o tenant protegido.

Refresh tokens aleatórios são armazenados como SHA-256. Rotação consome a sessão anterior atomicamente; revogação invalida também o JWT anterior. Tokens da interface ficam somente em memória; atualizar a página exige novo login. A resposta 401 tenta renovar uma vez. Não há senha padrão na interface.

Tenant é a raiz de isolamento ERA. Branch, User, Session, Product, AuditLog e OutboxEvent têm escopos/relacionamentos definidos por tenant; consultas HTTP usam o tenant autenticado. RLS do PostgreSQL ainda não foi configurado, portanto o isolamento depende dos repositórios e dos testes. Não existe papel global de superadministrador.

Permissões atuais incluem `products:read`, `products:create`, `audit:read`, `core:read`, permissões de filiais/usuários e `profiles:read`. Há perfis predefinidos limitados às funções implementadas. Ainda faltam perfis personalizados e políticas por filial/registro.

Esse controle ERA não substitui grupos, regras de registro ou empresas permitidas no Odoo. A separação multiempresa do Odoo ainda precisa ser configurada e testada com usuários e dados de teste diretamente no Odoo antes de uso real. A sessão ERA não concede acesso a dados Odoo.

## Catálogo legado, auditoria e eventos

O protótipo de produtos ERA executa controller → caso de uso → repository → transação Prisma. Produto, auditoria e evento outbox são gravados na mesma transação. Preços usam DECIMAL(18,2); SKU é único por tenant. A tela ERA atual não expõe esse catálogo como fonte operacional: produtos/estoque encaminham para o Inventário Odoo.

O worker de referência publica eventos da outbox no BullMQ, com jobId estável, tentativas e consumidor idempotente inicial. `publishedAt` significa enfileirado, não processado. Retenção, replay e observabilidade ainda requerem política. Contratos para Fidelizei, Nexo CRM, Type Digital e marketplaces não significam integrações prontas.

## Licenças e integrações futuras

Odoo Community é a opção de núcleo aprovada, sem Odoo Enterprise ou serviços pagos da KMEE. Nenhum módulo OCA deve ser considerado aprovado automaticamente: registrar repositório, versão-alvo Odoo, dependências, licença de cada módulo (LGPL/AGPL/outra), manutenção e impacto de segurança antes de instalar.

Uma futura integração deve usar API suportada e credenciais protegidas no Render, com menor privilégio. Definir autenticação, direção e propriedade dos dados, mapeamento multiempresa, idempotência, auditoria, tratamento de falhas e estratégia de migração antes de habilitar escrita.

## Operação e segurança

Swagger em `/docs` somente fora de produção. Schemas detalhados de corpos/respostas ainda precisam ser adicionados. Health check da API verifica PostgreSQL. Rate limiting básico é por processo; rate limit distribuído, proxies confiáveis e escala com múltiplas réplicas ainda não foram definidos.

Pendências para produção: MFA/SSO decidido e testado, regras multiempresa Odoo, RLS ou controles equivalentes, gestão e rotação de segredos, backups com restauração testada, Sentry/OpenTelemetry, observabilidade e política de retenção de filas, testes end-to-end e revisão de dependências.
