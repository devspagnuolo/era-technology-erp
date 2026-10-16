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
printf 'admin_passwd = %s\n' "$ODOO_MASTER_PASSWORD" >> /tmp/odoo.conf
if [ "${ODOO_RUN_INIT:-false}" = "true" ]; then
  odoo -c /tmp/odoo.conf -d "$ODOO_DB_NAME" -i "${ODOO_INIT_MODULES:-base,l10n_br_base,era_connector}" --stop-after-init
fi
exec odoo -c /tmp/odoo.conf -d "$ODOO_DB_NAME" --http-port "${PORT:-8069}"
