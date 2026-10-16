import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (path) => readFileSync(join(process.cwd(), path), "utf8");

test("free Odoo configuration scopes one database and runs single-process", () => {
  const config = read("odoo/odoo.conf");
  assert.match(config, /^list_db = False$/m);
  assert.match(config, /^dbfilter = \^%d\$$/m);
  assert.match(config, /^workers = 0$/m);
});
