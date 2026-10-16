from odoo import fields, models


class EraIntegrationSystem(models.Model):
    _name = "era.integration.system"
    _description = "ERA Integration System"
    _order = "name"

    name = fields.Char(required=True)
    code = fields.Selection(
        [("fidelizei", "Fidelizei"), ("type_digital", "Type Digital"), ("nexo_crm", "Nexo CRM")],
        required=True,
    )
    active = fields.Boolean(default=True)
    endpoint = fields.Char(help="Base URL only; credentials are managed as deployment secrets.")
