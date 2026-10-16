import os


def post_init_hook(env):
    env["ir.config_parameter"].sudo().set_param("ir_attachment.location", "db")
    admin_password = os.environ["ODOO_ADMIN_PASSWORD"]
    env.ref("base.user_admin").sudo().write({"password": admin_password})
