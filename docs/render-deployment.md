# Blueprint ERA no Render

O arquivo render.yaml provisiona era-admin (Next.js público), era-api (NestJS privado), era-worker (BullMQ), era-redis (Key Value persistente) e era-db (PostgreSQL 16), na região Ohio. Os planos definidos são pagos; revisar a estimativa exibida no Render antes da criação.

O navegador usa /v1 no mesmo domínio do painel. O Next.js encaminha as requisições para API_INTERNAL_HOSTPORT, obtido da rede privada do Render. A API não requer uma URL pública nem configuração manual de CORS para esse fluxo. Banco e Redis não aceitam conexões externas.

O Render gera JWT_SECRET. DATABASE_URL e REDIS_URL são vinculadas diretamente aos recursos. Nenhum segredo é armazenado no Git. npm ci --include=dev preserva TypeScript, Prisma CLI e ferramentas necessárias aos builds e migrations.

A migration roda no pre-deploy da API. O worker pode iniciar antes dela e repetirá a leitura da outbox até o banco estar pronto. O health check público /v1/health atravessa o proxy e verifica PostgreSQL.

Antes de criar a instância, a instalação GitHub do Render precisa ter acesso ao repositório privado devspagnuolo/era-technology-erp. Na inspeção inicial, esse repositório não estava na lista de quatro repositórios autorizados do workspace Fideliza+.

Depois do primeiro deploy, a criação da conta inicial precisa ser planejada com uma senha forte. O seed de desenvolvimento exige SEED_PASSWORD e não roda automaticamente neste Blueprint. Não divulgar nem versionar essa senha.

Referência: https://render.com/docs/blueprint-spec

Em 19/09/2026, o repositório ERA já apareceu autorizado na instalação GitHub existente do Render. Não foi necessário ampliar permissões durante essa retomada.
