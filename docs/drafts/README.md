# Rascunhos preservados na auditoria

Os arquivos de inventory e purchasing foram encontrados incompletos em services/api/src e impediam a compilação: imports incorretos, serviços ausentes e controladores sem contexto de tenant/permissão.

Foram preservados aqui, fora do código executável, sem excluir a intenção de implementação. Não são módulos entregues nem rotas publicadas. A conclusão requer contexto de tenant, RBAC, transações auditadas e testes de domínio/integração antes de serem registrados no AppModule.
