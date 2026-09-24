# Blueprint ERA no Render

O arquivo render.yaml provisiona era-admin (Next.js público), era-api (NestJS privado), era-worker (BullMQ), era-redis (Key Value persistente) e era-db (PostgreSQL 18), na região Oregon. Os planos definidos são pagos; revisar a estimativa exibida no Render antes da criação.

O navegador usa /v1 no mesmo domínio do painel. Uma rota do Next.js encaminha as requisições em tempo de execução para API_INTERNAL_HOSTPORT, obtido da rede privada do Render. A API não requer uma URL pública nem configuração manual de CORS para esse fluxo. Banco e Redis não aceitam conexões externas.

O Render gera JWT_SECRET. DATABASE_URL e REDIS_URL são vinculadas diretamente aos recursos. Nenhum segredo é armazenado no Git. npm ci --include=dev preserva TypeScript, Prisma CLI e ferramentas necessárias aos builds e migrations.

A migration roda no pre-deploy da API. O worker pode iniciar antes dela e repetirá a leitura da outbox até o banco estar pronto. O health check público /v1/health atravessa o proxy e verifica PostgreSQL.

Antes de criar a instância, a instalação GitHub do Render precisa ter acesso ao repositório privado devspagnuolo/era-technology-erp. Na inspeção inicial, esse repositório não estava na lista de quatro repositórios autorizados do workspace Fideliza+.

No primeiro deploy, o Render gera SEED_PASSWORD e o pre-deploy cria a conta inicial. O seed é idempotente e não altera a senha de usuários existentes. Consulte o valor de SEED_PASSWORD no ambiente privado de era-api para acessar a demo; não divulgar nem versionar essa senha.

Referência: https://render.com/docs/blueprint-spec

Em 19/09/2026, o repositório ERA já apareceu autorizado na instalação GitHub existente do Render. Não foi necessário ampliar permissões durante essa retomada.
