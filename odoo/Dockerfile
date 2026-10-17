FROM odoo:18.0
USER root
RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*
RUN python3 -m pip install --no-cache-dir --break-system-packages packaging num2words 'erpbrasil-base>=2.4.2' phonenumbers email-validator
RUN git init /mnt/oca/l10n-brazil && git -C /mnt/oca/l10n-brazil remote add origin https://github.com/OCA/l10n-brazil.git && git -C /mnt/oca/l10n-brazil fetch --depth 1 origin 8e71d15b74b3b646caece506d7f71dc04f4cf56d && git -C /mnt/oca/l10n-brazil checkout FETCH_HEAD
COPY odoo/era_addons /mnt/extra-addons
RUN git init /tmp/product-attribute && git -C /tmp/product-attribute remote add origin https://github.com/OCA/product-attribute.git && git -C /tmp/product-attribute config core.sparseCheckout true && printf 'uom_alias/\n' > /tmp/product-attribute/.git/info/sparse-checkout && git -C /tmp/product-attribute fetch --depth 1 origin 99f2e55944bb57568fbf3369b18ae0d06eb22b5d && git -C /tmp/product-attribute checkout FETCH_HEAD && cp -a /tmp/product-attribute/uom_alias /mnt/extra-addons/uom_alias && rm -rf /tmp/product-attribute
COPY odoo/odoo.conf /etc/odoo/odoo.conf
COPY odoo/start.sh /usr/local/bin/era-odoo-start
RUN chmod 0755 /usr/local/bin/era-odoo-start && chown -R odoo:odoo /mnt/extra-addons
USER odoo
ENTRYPOINT ["/usr/local/bin/era-odoo-start"]
