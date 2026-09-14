# Arquitetura e limites atuais

## Estrutura

Monólito modular em um monorepo: apps/admin (Next.js), services/api (NestJS), services/worker (BullMQ), packages/database (Prisma) e packages/shared (contratos). PDV e portal terão aplicações próprias quando seus fluxos forem implementados. Não há microserviços.

## Primeira fatia vertical

O cliente envia credenciais com o identificador público da empresa. A API valida o usuário naquela empresa e cria sessão. O JWT contém tenantId, sub e sid, com validade de 15 minutos, issuer e audience fixos. O servidor consulta a sessão e as permissões atuais em cada requisição. O corpo HTTP nunca define o tenant das operações protegidas.

Refresh tokens aleatórios são armazenados somente como SHA-256 no banco. A rotação consome a sessão anterior atomicamente e emite outra; revogação torna também o JWT anterior inválido. A UI mantém tokens apenas em memória: recarregar a página exige novo login. A resposta 401 tenta renovar a sessão uma vez. A tela de login não contém senha padrão.

Produtos: controller → caso de uso → repository → transação Prisma. A transação grava produto, auditoria e outbox; falha em qualquer etapa reverte tudo. Preços são strings decimais na API e DECIMAL(18,2) no PostgreSQL. SKU é único por tenant. O cadastro envia versão de evento explícita.

O worker entrega a outbox ao BullMQ com jobId estável e retentativas. publishedAt significa enfileirado, não processado. O consumidor inicial invalida uma chave Redis por tenant, de forma idempotente. Jobs concluídos e com falha são retidos; uma política operacional de retenção e replay deve ser definida antes de escalar. Eventos desconhecidos falham explicitamente.

## Entidades e relações

- Tenant é a raiz de isolamento. Seu próprio id identifica a empresa; não há tenantId autorreferente.
- Branch pertence a Tenant; código único por empresa.
- User pertence a Tenant; e-mail único por empresa.
- Session pertence simultaneamente a Tenant e User. A chave estrangeira composta impede referenciar usuário de outra empresa.
- Product pertence a Tenant; UUID e SKU têm índices compostos por tenant.
- AuditLog guarda tenant, usuário, IP, módulo, ação, registro, antes/depois e data.
- OutboxEvent guarda tenant, tipo versionado, payload e instante de enfileiramento.

As consultas HTTP são limitadas pelo tenant autenticado. Consulta de login por slug e varredura interna da outbox são exceções documentadas de infraestrutura. Não há acesso global por um papel de superadministrador. RLS ainda não foi configurado: o isolamento depende dos repositórios e da cobertura de testes.

## Permissões atuais

products:read, products:create, audit:read, core:read, branches:create, users:read, users:create, users:update e profiles:read. O papel é descritivo; não implica permissões automaticamente. Há nove perfis predefinidos, com permissões limitadas aos módulos já implementados. A criação de usuário aplica as permissões do perfil, sem permitir concessões superiores às do autor. Não é permitido alterar o próprio status. Ainda faltam perfis personalizados e políticas por registro/filial. Usuário inativo perde acesso imediatamente.

## Arquivos e integrações

ObjectStorage define URLs assinadas e exclusão com escopo de tenant, sem gravar uploads no disco local. O adaptador S3/R2/MinIO ainda não foi implementado. Contratos de eventos permitem consumidores futuros de Fidelizei, Nexo CRM, Type Digital e marketplaces; não constituem integrações prontas.

## Operação

Swagger em /docs somente fora de produção. As rotas são documentadas automaticamente; schemas detalhados de corpos/respostas ainda precisam ser adicionados. Health check verifica PostgreSQL. Limite HTTP básico de 60 requisições/minuto por processo; rate limiting distribuído e configuração do proxy devem ser definidos para múltiplas réplicas. Não confiar em X-Forwarded-For sem configurar proxies conhecidos.

Pendências antes de produção: Sentry/OpenTelemetry, gestão de segredos, backups e restore, RLS, observabilidade das filas, política de retenção, testes end-to-end. O blueprint Render é um ponto de partida; não foi publicado nem validado na plataforma.
