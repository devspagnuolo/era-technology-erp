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
import { toEra } from "../services/api/src/odoo-products";
import { stageOf } from "../services/api/src/odoo-orders";
import { SALES } from "../services/api/src/odoo-sales";
import { PURCHASES } from "../services/api/src/odoo-purchases";
import { parseArch } from "../services/api/src/odoo-arch";
import {
  buildSchema,
  isReadonly,
  toOdooValues,
} from "../services/api/src/odoo-form";
import { check, evaluate, names } from "../packages/shared/odoo-expr";
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
test("produtos e pedidos: leitura da lista e situação do pedido", () => {
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
  assert.deepEqual(
    ["draft", "sent", "sale", "cancel"].map((s) => stageOf(SALES.stages, s)),
    ["quotation", "quotation", "order", "cancelled"],
  );
  assert.deepEqual(
    ["draft", "to approve", "purchase", "done", "cancel"].map((s) =>
      stageOf(PURCHASES.stages, s),
    ),
    ["quotation", "quotation", "order", "order", "cancelled"],
  );
});

test("expressões do Odoo: condições de tela e domínios", () => {
  const scope = {
    state: "draft",
    partner_id: { id: 5, name: "Cliente" },
    tag_ids: [{ id: 1, name: "A" }],
    parent: { state: "sale" },
    qty: 2,
  };
  assert.equal(check("state in ['sale', 'cancel']", scope), false);
  assert.equal(check("parent.state == 'sale'", scope), true);
  assert.equal(check("not partner_id or qty > 3", scope), false);
  assert.equal(check("context.get('x')", scope), false);
  assert.equal(check("1", {}), true);
  assert.deepEqual(
    evaluate("[('id', '!=', partner_id)] + [('x', 'in', tag_ids)]", scope),
    [
      ["id", "!=", 5],
      ["x", "in", [1]],
    ],
  );
  assert.equal(evaluate("'a' if qty == 2 else 'b'", scope), "a");
  assert.deepEqual(names("parent.state == 'x' or not partner_id"), [
    "partner_id",
  ]);
  // Expressão inválida nunca libera nem quebra a tela.
  assert.equal(check("state ==", scope), false);
});

const ARCH = `<form>
  <header><button name="go"/><field name="state" widget="statusbar"/></header>
  <sheet>
    <div class="oe_button_box" name="button_box"><button name="x"/></div>
    <field name="name" required="1" placeholder="Nome &amp; sobrenome"/>
    <group string="Dados">
      <field name="is_company" on_change="1"/>
      <field name="email" invisible="is_company"/>
      <field name="secret" invisible="1"/>
      <field name="company_id"/>
    </group>
    <notebook>
      <page string="Itens" invisible="state == 'cancel'">
        <field name="line_ids">
          <list>
            <field name="order_id"/>
            <field name="product_id" readonly="not product_updatable"/>
            <field name="qty" column_invisible="parent.state == 'sale'"/>
          </list>
        </field>
      </page>
    </notebook>
  </sheet>
  <chatter/>
</form>`;
const MODELS = {
  "x.order": {
    fields: {
      name: { name: "name", type: "char", string: "Nome" },
      state: {
        name: "state",
        type: "selection",
        string: "Situação",
        selection: [["draft", "Rascunho"]] as Array<[string, string]>,
      },
      is_company: { name: "is_company", type: "boolean", string: "Empresa" },
      email: { name: "email", type: "char", string: "E-mail" },
      secret: { name: "secret", type: "char", string: "Segredo" },
      company_id: {
        name: "company_id",
        type: "many2one",
        string: "Empresa",
        relation: "res.company",
      },
      line_ids: {
        name: "line_ids",
        type: "one2many",
        string: "Itens",
        relation: "x.line",
        relation_field: "order_id",
      },
    },
  },
  "x.line": {
    fields: {
      order_id: {
        name: "order_id",
        type: "many2one",
        string: "Pedido",
        relation: "x.order",
      },
      product_id: {
        name: "product_id",
        type: "many2one",
        string: "Variante",
        relation: "product.product",
      },
      product_updatable: {
        name: "product_updatable",
        type: "boolean",
        string: "Pode trocar",
      },
      qty: { name: "qty", type: "float", string: "Quantidade" },
    },
  },
};

test("formulário vem da tela do Odoo: abas, grupos, condições e itens", () => {
  const schema = buildSchema("x.order", parseArch(ARCH), MODELS, {
    hidden: ["company_id"],
    labels: { product_id: "Produto" },
  });
  assert.deepEqual(schema.sections, [
    { title: "Geral", fields: ["name", "is_company", "email"] },
    { title: "Itens", fields: ["line_ids"] },
  ]);
  const { name, email, is_company, line_ids } = schema.fields;
  assert.equal(name.required, true);
  assert.equal(name.placeholder, "Nome & sobrenome");
  assert.equal(email.invisibleIf, "is_company");
  assert.equal(email.group, "Dados");
  assert.equal(is_company.onChange, true);
  assert.equal(line_ids.invisibleIf, "state == 'cancel'");
  // Situação (barra de status), botões e campos ocultos ficam fora.
  assert.equal(schema.fields.state, undefined);
  assert.equal(schema.fields.secret, undefined);
  assert.deepEqual(schema.deps, ["state"]);
  const sub = line_ids.sub!;
  assert.equal(sub.inverse, "order_id");
  assert.deepEqual(sub.columns, ["product_id", "qty"]);
  assert.equal(sub.fields.product_id.label, "Produto");
  assert.equal(sub.fields.qty.columnInvisibleIf, "parent.state == 'sale'");
  assert.deepEqual(sub.deps, ["product_updatable"]);
  // Somente leitura condicional só vale quando o Odoo informou as dependências.
  assert.equal(isReadonly(sub.fields.product_id, {}), false);
  assert.equal(
    isReadonly(sub.fields.product_id, { product_updatable: false }),
    true,
  );
});

test("gravação aceita só campos da tela e vira comandos do Odoo", () => {
  const schema = buildSchema("x.order", parseArch(ARCH), MODELS, {
    hidden: ["company_id"],
  });
  const refs = new Map<string, Set<number>>();
  assert.throws(
    () => toOdooValues(schema.fields, { company_id: 2 }, {}, refs),
    /Campo não permitido: company_id/,
  );
  assert.throws(
    () => toOdooValues(schema.fields, { secret: "x" }, {}, refs),
    /Campo não permitido/,
  );
  const current = {
    id: 9,
    line_ids: [
      { id: 31, product_id: { id: 1, name: "A" }, qty: 1 },
      { id: 32, product_id: { id: 2, name: "B" }, qty: 1 },
    ],
  };
  const out = toOdooValues(
    schema.fields,
    {
      name: "Pedido",
      email: "",
      line_ids: [
        { id: 31, qty: 3 },
        { product_id: 4, qty: 1 },
      ],
    },
    current,
    refs,
  );
  assert.equal(out.name, "Pedido");
  assert.equal(out.email, false);
  assert.deepEqual(out.line_ids, [
    [1, 31, { qty: 3 }],
    [0, 0, { product_id: 4, qty: 1 }],
    [2, 32],
  ]);
  assert.deepEqual([...(refs.get("product.product") ?? [])], [4]);
  assert.throws(
    () =>
      toOdooValues(
        schema.fields,
        { line_ids: [{ id: 99, qty: 1 }] },
        current,
        refs,
      ),
    /não pertence/,
  );
});
