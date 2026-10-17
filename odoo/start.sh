#!/bin/sh
set -eu
: "${HOST:?HOST is required}"
: "${USER:?USER is required}"
: "${PASSWORD:?PASSWORD is required}"
: "${ODOO_DB_NAME:?ODOO_DB_NAME is required}"
: "${ODOO_MASTER_PASSWORD:?ODOO_MASTER_PASSWORD is required}"
: "${ODOO_ADMIN_PASSWORD:?ODOO_ADMIN_PASSWORD is required}"
export PGHOST="$HOST" PGUSER="$USER" PGPASSWORD="$PASSWORD"
cp /etc/odoo/odoo.conf /tmp/odoo.conf
printf 'admin_passwd = %s\\n' "$ODOO_MASTER_PASSWORD" >> /tmp/odoo.conf
if [ "${ODOO_RUN_INIT:-false}" = "true" ]; then
  odoo -c /tmp/odoo.conf -d "$ODOO_DB_NAME" -i "${ODOO_INIT_MODULES:-base,l10n_br_base,era_connector}" --stop-after-init
fi

# Apply an explicitly requested admin password recovery once per database.
# Odoo shell executes stdin in non-interactive mode; commit before its automatic rollback.
if [ "${ODOO_RESET_ADMIN_PASSWORD_ONCE:-false}" = "true" ]; then
  odoo shell -c /tmp/odoo.conf -d "$ODOO_DB_NAME" <<'PY'
import os

params = env['ir.config_parameter'].sudo()
marker = 'era.admin_password_reset_once_20261017'
if params.get_param(marker) != 'done':
    env.ref('base.user_admin').sudo().write({
        'password': os.environ['ODOO_ADMIN_PASSWORD'],
    })
    params.set_param(marker, 'done')
    env.cr.commit()
PY
fi

# Usuário técnico da API ERA (idempotente). Habilitar só quando precisar criar ou
# trocar a senha; a senha vem de ERA_INTEGRATION_PASSWORD, nunca do repositório.
if [ "${ERA_PROVISION_INTEGRATION:-false}" = "true" ]; then
  : "${ERA_INTEGRATION_PASSWORD:?ERA_INTEGRATION_PASSWORD is required}"
  odoo shell -c /tmp/odoo.conf -d "$ODOO_DB_NAME" --no-http < /usr/local/share/era/provision_integration.py
fi

exec odoo -c /tmp/odoo.conf -d "$ODOO_DB_NAME" --http-port "${PORT:-8069}"
