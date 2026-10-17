import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BadGatewayException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from "@nestjs/common";
import {
  OdooClient,
  parseCompanies,
  readOdooConfig,
  translate,
} from "../services/api/src/odoo";
import {
  odooProductInput,
  odooProductUpdate,
  toEra,
  toOdoo,
} from "../services/api/src/odoo-products";
test("vínculo empresa ERA → empresa Odoo vem do ambiente", () => {
  assert.deepEqual(parseCompanies("era-demo:1, loja-2 : 4,"), {
    "era-demo": 1,
    "loja-2": 4,
  });
  assert.throws(() => parseCompanies("era-demo:abc"));
  assert.equal(readOdooConfig({ ODOO_URL: "http://odoo" }), null);
});
test("sem configuração a integração responde 503 sem chamar o Odoo", async () => {
  const client = new OdooClient(null);
  assert.equal(client.configured, false);
  assert.throws(
    () => client.companyFor("era-demo"),
    ServiceUnavailableException,
  );
  await assert.rejects(() => client.version(), ServiceUnavailableException);
});
test("empresa ERA sem vínculo não acessa nenhuma empresa Odoo", () => {
  const client = new OdooClient({
    url: "http://odoo",
    db: "era",
    login: "era",
    apiKey: "k",
    companies: { "era-demo": 1 },
    timeoutMs: 1000,
  });
  assert.equal(client.companyFor("era-demo"), 1);
  assert.throws(() => client.companyFor("outra"), ServiceUnavailableException);
});
test("erros de regra do Odoo chegam ao usuário; erros internos não", () => {
  const rule = translate({
    data: {
      name: "odoo.exceptions.ValidationError",
      message: "Código inválido",
    },
  });
  assert.ok(rule instanceof UnprocessableEntityException);
  assert.equal(rule.message, "Código inválido");
  const internal = translate({
    data: { name: "builtins.ValueError", message: "Traceback secreto" },
  });
  assert.ok(internal instanceof BadGatewayException);
  assert.doesNotMatch(internal.message, /Traceback/);
});
test("mapeia campos ERA ↔ Odoo sem aceitar empresa ou campos livres", () => {
  assert.equal(
    odooProductInput.safeParse({
      name: "X",
      sku: "1",
      salePrice: "1",
      company_id: 2,
    }).success,
    false,
  );
  assert.equal(odooProductUpdate.safeParse({}).success, false);
  assert.deepEqual(
    toOdoo(
      odooProductUpdate.parse({ salePrice: "10.50", uomId: 3, barcode: "" }),
    ),
    { list_price: 10.5, uom_id: 3, uom_po_id: 3, barcode: false },
  );
  assert.equal(
    toOdoo({ type: "service", tracksStock: true }).is_storable,
    false,
  );
  assert.deepEqual(
    toEra({
      id: 7,
      name: "Camiseta",
      default_code: false,
      barcode: false,
      list_price: 49.9,
      standard_price: 0,
      categ_id: [1, "All"],
      uom_id: false,
      type: "consu",
      active: true,
    }),
    {
      id: 7,
      name: "Camiseta",
      sku: "",
      barcode: null,
      salePrice: "49.90",
      cost: "0.00",
      category: { id: 1, name: "All" },
      uom: null,
      type: "consu",
      tracksStock: false,
      quantity: null,
      active: true,
    },
  );
});
