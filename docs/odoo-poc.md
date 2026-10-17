# POC Odoo Community — ERA

## Plano gratuito e escopo

Esta POC usa Odoo Community 18, PostgreSQL 16 Free e serviço web Free em workspace Hobby. O Odoo roda em modo de processo único, instala somente base, l10n_br_base e era_connector e guarda anexos no PostgreSQL para não depender de disco persistente. O banco Free expira 30 dias após criação e não tem backup gerenciado; o serviço web pode dormir após inatividade e reiniciar. Não use dados reais nem produção. Na Render, `ODOO_RUN_INIT` já está como `false` depois da instalação inicial para evitar executar instalação a cada reinício. Para uma base vazia, habilite a rotina de inicialização apenas durante a implantação inicial.

## Licenças e versões

- Odoo Community 18: LGPL-3.0.
- OCA/l10n-brazil: commit `8e71d15b74b3b646caece506d7f71dc04f4cf56d` da branch 18.0; o repositório declara AGPL-3.0. Confira a licença declarada em cada manifest antes de ativar módulos adicionais.
- `era_connector`: AGPL-3.0. Não contém segredos.
- Nenhum Odoo Enterprise ou módulo/serviço pago da KMEE.
- Como os addons selecionados são AGPL-3.0, valide as obrigações aplicáveis antes de oferecer o sistema pela rede, inclusive a oferta do código-fonte correspondente em caso de modificações cobertas pela licença.

## Configuração e integrações

O módulo cria um cadastro de endpoints para Fidelizei, Type Digital e Nexo CRM. Ainda não implementa chamadas externas. O controle de acesso é restrito a administradores do sistema; não há tokens, senhas de integração ou payloads armazenados. Credenciais, contratos e endpoints só devem ser definidos ao iniciar cada integração.

## Multiempresa e segurança

A POC restringe a instância a um único banco (`dbfilter` exato, `list_db=False`), ativa `proxy_mode` e mantém as senhas PostgreSQL, master e administrador fora do repositório. O armazenamento de anexos usa o banco. Usuários devem receber somente as empresas autorizadas por `res.company` e pelas regras de acesso Odoo.

O cadastro atual de endpoints é global e somente administradores podem alterá-lo. Antes de conectar qualquer integração, decidir se cada serviço é global ou separado por empresa jurídica; se for por empresa, incluir vínculo `company_id`, regras de registro e segredos separados antes de habilitar chamadas externas. Não reutilizar uma credencial entre empresas sem confirmação dos respectivos contratos.

## Usuário técnico da API ERA

A API ERA lê e grava no Odoo com o usuário `era-integracao` (grupos Usuário interno e Inventário/Administrador, apenas na empresa principal). Para criar o usuário ou trocar a senha, defina `ERA_INTEGRATION_PASSWORD` e `ERA_PROVISION_INTEGRATION=true` no serviço Odoo, faça um deploy e volte `ERA_PROVISION_INTEGRATION` para `false`. A mesma senha vai em `ODOO_API_KEY` no `era-api`. O Inventário (`stock`) precisa estar instalado: inclua `stock` em `ODOO_INIT_MODULES` com `ODOO_RUN_INIT=true` em um deploy.

## Uso local

Execute Docker Compose com `odoo/docker-compose.poc.yml`.

Acesse `http://localhost:8069` com o usuário `admin` e o valor local de `ODOO_ADMIN_PASSWORD` (senha apenas para desenvolvimento). Na Render, `ODOO_ADMIN_PASSWORD`, `ODOO_MASTER_PASSWORD` e `PASSWORD` são segredos gerados/configurados fora do repositório. Não compartilhe seus valores em tickets ou mensagens.

## Próximas decisões

Antes de sair da POC: migrar para compute e PostgreSQL pagos, armazenamento persistente, backups, domínio e MFA. Para a identidade ERA, fornecer o logo, cores e nome corporativo que deve aparecer na tela (hoje ainda há o placeholder padrão do Odoo). Para fiscal: CNPJ, regime, UF/municípios, certificado e requisitos NF-e/NFC-e/NFS-e. Revisar compliance e licenças dos addons selecionados.
