# POC Odoo Community — ERA

## Plano gratuito e escopo

Esta POC usa Odoo Community 18, PostgreSQL 16 Free e serviço web Free em workspace Hobby. O Odoo roda em modo de processo único, instala somente base, l10n_br_base e era_connector e guarda anexos no PostgreSQL para não depender de disco persistente. O banco free expira em 30 dias e não tem backup gerenciado; o serviço web pode dormir e reiniciar. Não use dados reais nem produção.

## Licenças e versões

- Odoo Community 18: LGPL-3.0.
- OCA/l10n-brazil: commit 8e71d15b74b3b646caece506d7f71dc04f4cf56d da branch 18.0, AGPL-3.0 no repositório; conferir a licença declarada individualmente em cada manifest antes de ativar módulos adicionais.
- era_connector: AGPL-3.0. Não contém segredos.
- Nenhum Odoo Enterprise ou módulo/serviço pago da KMEE.

## Configuração e integrações

O módulo cria um cadastro de endpoints para Fidelizei, Type Digital e Nexo CRM. Ainda não implementa chamadas externas; credenciais devem ser segredos de ambiente e contratos/endpoints precisam ser definidos.

## Multiempresa e segurança

Cada empresa usa registros Odoo isolados por res.company, grupos e regras de registro. Usuários só devem receber acesso às empresas autorizadas. A POC restringe conexão a um único banco (dbfilter exato, list_db=False), ativa proxy mode e mantém senhas do PostgreSQL, master e administrador fora do repositório. O armazenamento de anexos usa o banco.

## Uso local

Execute docker compose com o arquivo odoo/docker-compose.poc.yml.

Acesse http://localhost:8069 e use o login admin com o valor definido em ODOO_ADMIN_PASSWORD no Compose local (senha apenas para desenvolvimento). Na Render, a senha é gerada e gravada como segredo.

## Próximas decisões

Antes de sair da POC: migrar para compute e PostgreSQL pagos, adicionar disco persistente ou armazenamento compatível, backups, domínio e MFA. Para fiscal: CNPJ, regime, UF/municípios, certificado e requisitos NF-e/NFC-e/NFS-e. Revisar compliance e licenças dos addons selecionados.
