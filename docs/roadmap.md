# Roadmap ERA ERP

## Regra de escopo

Odoo Community é o motor e a fonte oficial dos registros operacionais. A interface ERA simplifica navegação e experiência; não duplicar CRM, vendas, estoque ou fiscal na API ERA enquanto não houver decisão explícita de integração ou migração. Odoo Enterprise e serviços pagos da KMEE estão fora do escopo. Módulos comunitários OCA precisam de análise de versão, dependências, licença e segurança antes da instalação.

## Publicado

- Painel ERA Next.js no Render, com identidade oficial ERA e layout responsivo de login.
- Visão geral e central de 19 atalhos relacionados ao menu existente do Odoo.
- Os cartões abrem o seletor do Odoo; não escolhem automaticamente o aplicativo e não sincronizam registros.
- API privada NestJS e PostgreSQL separados para o protótipo de autenticação/administração ERA.
- Login ERA e login Odoo permanecem separados.
- Deploy do painel confirmado ativo em 17/10/2026; detalhes e limites em [render-deployment.md](render-deployment.md).
- Produtos: tela ERA que consulta, cadastra, edita e arquiva diretamente no Odoo (`product.template`), com isolamento por empresa e auditoria ERA. Requer configurar o usuário técnico no Odoo; ver [odoo-integration.md](odoo-integration.md).

## Próximos passos

1. **Inventário do ambiente Odoo:** registrar versão Community realmente implantada, módulos instalados/ativos, idioma, addons, configuração multiempresa e saúde do backup. Não alterar banco ou serviço durante o inventário.
2. **Catálogo de módulos:** relacionar cada atalho ERA ao identificador/ação real do Odoo e criar deep links somente após validar acesso, idioma e versão. Informar quando módulo estiver ausente.
3. **Escolha da integração:** definir se ERA utilizará sessão SSO, API com usuário técnico de menor privilégio ou outra abordagem suportada; definir autenticação e consentimento sem expor credenciais no navegador.
4. **Piloto somente leitura:** integrar um domínio (por exemplo, consulta de produtos) com filtros e regras multiempresa herdados do usuário Odoo; validar isolamento com empresas de teste antes de expor dados.
5. **Escrita controlada:** só depois do piloto, aprovar mapeamentos, idempotência, auditoria, tratamento de falhas e qual sistema é mestre para cada campo.
6. **Brasil e integrações externas:** verificar módulos de localização brasileira OCA e licenças; avaliar Fidelizei, Type Digital e Nexo CRM uma a uma, sem ativar serviços pagos sem autorização.
7. **Preparação operacional:** backups e restauração, monitoramento, limites de recurso/custos e revisão de segurança/dependências antes de qualquer uso com dados reais.

## Protótipo técnico legado da API ERA

A base contém autenticação multiempresa ERA, permissões por ação, filiais, usuários, perfis predefinidos, auditoria e endpoints de produtos. Esses endpoints pertencem ao protótipo PostgreSQL ERA; não representam sincronização com Odoo. Decidir o destino desses dados antes de tornar qualquer cadastro duplicado operacional.

## Critérios de aceite por módulo

Cada etapa requer: comportamento funcional aprovado; licença e versão registradas; testes de autorização e isolamento multiempresa; observabilidade de erros; documentação; sem segredos no Git; validação de custo/limite Render quando houver mudança de infraestrutura. Não usar dados de clientes em testes.
