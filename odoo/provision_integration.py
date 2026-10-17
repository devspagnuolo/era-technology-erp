# Executado por start.sh via `odoo shell` quando ERA_PROVISION_INTEGRATION=true.
# Garante o usuário técnico usado pela API ERA, de forma idempotente.
import os

login = os.environ.get("ERA_INTEGRATION_LOGIN", "era-integracao")
password = os.environ["ERA_INTEGRATION_PASSWORD"]
company = env.ref("base.main_company")
groups = [env.ref("base.group_user").id]
# Acessos dos módulos que a ERA lê e grava; módulos ausentes são ignorados.
for xmlid, area in [
    ("stock.group_stock_manager", "Inventário"),
    ("sales_team.group_sale_manager", "Vendas"),
    ("purchase.group_purchase_manager", "Compras"),
    ("account.group_account_manager", "Faturamento"),
    ("l10n_br_fiscal.group_manager", "Fiscal"),
    ("mrp.group_mrp_manager", "Fabricação"),
    ("project.group_project_manager", "Projeto"),
    ("hr.group_hr_manager", "Funcionários"),
    ("maintenance.group_equipment_manager", "Manutenção"),
    ("hr_holidays.group_hr_holidays_manager", "Folga"),
    ("hr_expense.group_hr_expense_manager", "Despesas"),
]:
    group = env.ref(xmlid, raise_if_not_found=False)
    if group:
        groups.append(group.id)
    else:
        print("era.provision: módulo de", area, "ausente; usuário criado sem esse acesso")
Users = env["res.users"].sudo().with_context(active_test=False)
user = Users.search([("login", "=", login)], limit=1)
values = {
    "name": "ERA Integração",
    "active": True,
    "company_id": company.id,
    "company_ids": [(6, 0, [company.id])],
    "groups_id": [(6, 0, groups)],
}
if user:
    user.write(values)
else:
    user = Users.create({**values, "login": login})
user.write({"password": password})
env.cr.commit()
print("era.provision: usuário", login, "pronto; empresa", company.id)
