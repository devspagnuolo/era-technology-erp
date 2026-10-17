# Executado por start.sh via `odoo shell` quando ERA_PROVISION_INTEGRATION=true.
# Garante o usuário técnico usado pela API ERA, de forma idempotente.
import os

login = os.environ.get("ERA_INTEGRATION_LOGIN", "era-integracao")
password = os.environ["ERA_INTEGRATION_PASSWORD"]
company = env.ref("base.main_company")
groups = [env.ref("base.group_user").id]
stock_manager = env.ref("stock.group_stock_manager", raise_if_not_found=False)
if stock_manager:
    groups.append(stock_manager.id)
else:
    print("era.provision: módulo stock ausente; usuário criado sem acesso a Inventário")
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
