# Blueprint ERA no Render

O arquivo render.yaml provisiona era-admin (Next.js público), era-api (NestJS privado) e era-db (PostgreSQL 18), na região Virginia, sem modificar os recursos do Odoo. A API usa o menor plano privado pago e o PostgreSQL é dedicado à ERA. O painel usa o plano gratuito, então pode suspender após 15 minutos sem tráfego e levar cerca de um minuto para acordar.

Estimativa atual dos recursos novos, antes de impostos ou excedentes: cerca de US$ 13/mês (API privada: US$ 7; PostgreSQL 256 MB: US$ 6; painel gratuito: US$ 0). O valor deve ser confirmado no resumo do Render antes de clicar em Apply. O worker e o Key Value/Redis foram adiados para reduzir custo; produtos ainda gravam eventos na outbox do banco, então o volume deve permanecer pequeno durante o piloto. Ative e dimensione o consumidor de eventos antes de integrar serviços externos ou usar a ERA em operação contínua.

O navegador usa /v1 no mesmo domínio do painel. Uma rota do Next.js encaminha as requisições em tempo de execução para API_INTERNAL_HOSTPORT, obtido da rede privada do Render. A API não requer uma URL pública nem configuração manual de CORS para esse fluxo. O banco não aceita conexões externas.

O painel ERA inclui uma central de módulos que abre o seletor de aplicativos do Odoo configurado em `NEXT_PUBLIC_ODOO_URL` (padrão atual: `https://era-odoo-poc.onrender.com`). Essa variável é pública e não deve conter credenciais. Os cartões são atalhos: a autenticação Odoo continua separada e os registros ainda não são sincronizados com os cadastros ERA desta aplicação. Configure a variável também no ambiente de build do serviço `era-admin` antes de publicar.

O Render gera JWT_SECRET e SEED_PASSWORD; DATABASE_URL e API_INTERNAL_HOSTPORT são vinculadas aos recursos correspondentes. NEXT_PUBLIC_ODOO_URL é configuração pública, não segredo. Nenhum segredo é armazenado no Git. npm ci --include=dev preserva TypeScript, Prisma CLI e ferramentas necessárias aos builds e migrations.

A migration e o seed idempotente rodam no pre-deploy da API. O health check público /v1/health atravessa o proxy e verifica PostgreSQL. A outbox é mantida nesta etapa, mas sem consumidor de fila até a inclusão do worker.

O repositório privado `devspagnuolo/era-technology-erp` já está conectado ao serviço Odoo. Os serviços ERA deste Blueprint acompanham `main`; o serviço Odoo existente acompanha `feat/odoo-community-poc`, para manter os deploys separados.

No primeiro deploy, o Render gera SEED_PASSWORD e o pre-deploy cria a conta inicial. O seed é idempotente e não altera a senha de usuários existentes. Consulte o valor de SEED_PASSWORD no ambiente privado de era-api para acessar a demo; não divulgar nem versionar essa senha.

Referência: https://render.com/docs/blueprint-spec

Em 19/09/2026, o repositório ERA já apareceu autorizado na instalação GitHub existente do Render. Não foi necessário ampliar permissões durante essa retomada.
