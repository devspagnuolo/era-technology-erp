import os

from odoo import SUPERUSER_ID


def post_init_hook(env):
    env["ir.config_parameter"].sudo().set_param("ir_attachment.location", "db")
    admin_password = os.environ["ODOO_ADMIN_PASSWORD"]
    env["res.users"].sudo().browse(SUPERUSER_ID).write({"password": admin_password})
