import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import { BadRequestException } from "@nestjs/common";
import { pyContext, pyDomain } from "../services/api/src/odoo-pyval";
import {
  decodeKey,
  modelAccess,
  safeContext,
} from "../services/api/src/odoo-runtime";

test("domínios das ações do Odoo viram listas avaliadas", () => {
  assert.deepEqual(pyDomain("[('move_type', '=', 'out_invoice')]", {}), [
    ["move_type", "=", "out_invoice"],
  ]);
  assert.deepEqual(
    pyDomain(
      "['|', ('company_id', '=', False), ('company_id', 'in', allowed_company_ids)]",
      {
        allowed_company_ids: [2],
      },
    ),
    ["|", ["company_id", "=", false], ["company_id", "in", [2]]],
  );
  assert.deepEqual(pyDomain("", {}), []);
  // Datas relativas não são avaliadas: o filtro é omitido, não inventado.
  assert.equal(pyDomain("[('date', '<', context_today())]", {}), null);
});

test("contextos aceitam get, not in e chamadas desconhecidas", () => {
  const scope = { context: { default_move_type: "in_invoice" }, uid: 6 };
  assert.deepEqual(
    pyContext(
      "{'default_move_type': context.get('default_move_type', 'entry'), 'search_default_user_id': uid, 'today': context_today().strftime('%Y'), 'purchase': context.get('default_move_type') not in ('out_invoice', 'out_refund')}",
      scope,
    ),
    {
      default_move_type: "in_invoice",
      search_default_user_id: 6,
      today: null,
      purchase: true,
    },
  );
  assert.deepEqual(pyContext("{'a': context.get('x', 3)}", { context: {} }), {
    a: 3,
  });
  assert.deepEqual(pyContext("não é python", {}), {});
});

test("modelos técnicos ficam fora e configurações exigem administrador", () => {
  assert.equal(modelAccess("account.move"), "open");
  assert.equal(modelAccess("fleet.vehicle"), "open");
  assert.equal(modelAccess("res.users"), "blocked");
  assert.equal(modelAccess("ir.rule"), "blocked");
  assert.equal(modelAccess("res.config.settings"), "admin");
  assert.equal(modelAccess("ir.module.module"), "admin");
  assert.equal(modelAccess("Account.Move"), "blocked");
  assert.equal(modelAccess("account"), "blocked");
});

test("o navegador não troca empresa, usuário nem idioma pelo contexto", () => {
  assert.deepEqual(
    safeContext({
      default_partner_id: 7,
      allowed_company_ids: [1, 2],
      force_company: 2,
      uid: 1,
      su: true,
      lang: "en_US",
      _private: 1,
      "bad key": 1,
    }),
    { default_partner_id: 7 },
  );
  assert.deepEqual(safeContext([1]), {});
  const key = Buffer.from(
    JSON.stringify({ view: 12, context: { uid: 1, active_id: 3 } }),
  ).toString("base64url");
  assert.deepEqual(decodeKey(key), { view: 12, context: { active_id: 3 } });
  assert.deepEqual(decodeKey("_"), {});
  assert.throws(() => decodeKey("%%%"), BadRequestException);
});
