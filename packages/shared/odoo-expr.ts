// Avaliador das expressões Python usadas nas telas do Odoo 17+ (atributos
// invisible, readonly, required e domain). Suporta o subconjunto que as telas
// usam: literais, listas/tuplas, nomes (inclusive parent.campo), not/and/or,
// comparações, in/not in e chamadas simples (tratadas como indefinidas).
export type Scope = Record<string, unknown>;

type Token = { kind: "num" | "str" | "name" | "op"; value: string };
type Node =
  | { t: "lit"; v: unknown }
  | { t: "name"; path: string[] }
  | { t: "list"; items: Node[] }
  | { t: "not"; arg: Node }
  | { t: "neg"; arg: Node }
  | { t: "bool"; op: "and" | "or"; left: Node; right: Node }
  | { t: "cmp"; op: string; left: Node; right: Node }
  | { t: "add"; op: "+" | "-"; left: Node; right: Node }
  | { t: "call"; callee: Node; args: Node[] }
  | { t: "cond"; test: Node; then: Node; other: Node };

const OPS = [
  "==",
  "!=",
  "<=",
  ">=",
  "<",
  ">",
  "(",
  ")",
  "[",
  "]",
  ",",
  ".",
  "-",
  "+",
  "%",
];

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === "'" || c === '"') {
      let j = i + 1;
      let value = "";
      while (j < source.length && source[j] !== c) {
        if (source[j] === "\\" && j + 1 < source.length) j++;
        value += source[j++];
      }
      if (j >= source.length) throw new Error("texto sem fim");
      tokens.push({ kind: "str", value });
      i = j + 1;
      continue;
    }
    const num = /^\d+(\.\d+)?/.exec(source.slice(i));
    if (num) {
      tokens.push({ kind: "num", value: num[0] });
      i += num[0].length;
      continue;
    }
    const name = /^[A-Za-z_][A-Za-z0-9_]*/.exec(source.slice(i));
    if (name) {
      tokens.push({ kind: "name", value: name[0] });
      i += name[0].length;
      continue;
    }
    const op = OPS.find((o) => source.startsWith(o, i));
    if (!op) throw new Error("símbolo inesperado " + c);
    tokens.push({ kind: "op", value: op });
    i += op.length;
  }
  return tokens;
}

class Parser {
  private i = 0;
  constructor(private tokens: Token[]) {}
  parse() {
    const node = this.ternary();
    if (this.i < this.tokens.length) throw new Error("expressão incompleta");
    return node;
  }
  private peek(value?: string) {
    const token = this.tokens[this.i];
    if (!token) return undefined;
    if (value !== undefined && token.value !== value) return undefined;
    if (value !== undefined && token.kind === "str") return undefined;
    return token;
  }
  private eat(value: string) {
    if (!this.peek(value)) throw new Error("esperado " + value);
    this.i++;
  }
  private ternary(): Node {
    const then = this.or();
    if (this.peek("if")) {
      this.i++;
      const test = this.or();
      this.eat("else");
      return { t: "cond", test, then, other: this.ternary() };
    }
    return then;
  }
  private or(): Node {
    let left = this.and();
    while (this.peek("or")) {
      this.i++;
      left = { t: "bool", op: "or", left, right: this.and() };
    }
    return left;
  }
  private and(): Node {
    let left = this.not();
    while (this.peek("and")) {
      this.i++;
      left = { t: "bool", op: "and", left, right: this.not() };
    }
    return left;
  }
  private not(): Node {
    if (this.peek("not")) {
      this.i++;
      return { t: "not", arg: this.not() };
    }
    return this.compare();
  }
  private compare(): Node {
    let left = this.additive();
    for (;;) {
      const token = this.peek();
      if (!token || token.kind === "str" || token.kind === "num") return left;
      let op: string | null = null;
      if (["==", "!=", "<=", ">=", "<", ">"].includes(token.value)) {
        op = token.value;
        this.i++;
      } else if (token.value === "in") {
        op = "in";
        this.i++;
      } else if (
        token.value === "not" &&
        this.tokens[this.i + 1]?.value === "in"
      ) {
        op = "not in";
        this.i += 2;
      } else if (token.value === "is") {
        this.i++;
        if (this.peek("not")) {
          this.i++;
          op = "!=";
        } else op = "==";
      }
      if (!op) return left;
      left = { t: "cmp", op, left, right: this.additive() };
    }
  }
  private additive(): Node {
    let left = this.unary();
    for (;;) {
      const op = this.peek("+") ? "+" : this.peek("-") ? "-" : null;
      if (!op) return left;
      this.i++;
      left = { t: "add", op, left, right: this.unary() };
    }
  }
  private unary(): Node {
    if (this.peek("-")) {
      this.i++;
      return { t: "neg", arg: this.unary() };
    }
    return this.postfix();
  }
  private postfix(): Node {
    let node = this.atom();
    for (;;) {
      if (this.peek(".") && node.t === "name") {
        this.i++;
        const next = this.tokens[this.i++];
        if (!next || next.kind !== "name") throw new Error("nome esperado");
        node = { t: "name", path: [...node.path, next.value] };
      } else if (this.peek("(")) {
        this.i++;
        const args: Node[] = [];
        while (!this.peek(")")) {
          args.push(this.ternary());
          if (!this.peek(")")) this.eat(",");
        }
        this.i++;
        node = { t: "call", callee: node, args };
      } else return node;
    }
  }
  private atom(): Node {
    const token = this.tokens[this.i++];
    if (!token) throw new Error("expressão incompleta");
    if (token.kind === "num") return { t: "lit", v: Number(token.value) };
    if (token.kind === "str") return { t: "lit", v: token.value };
    if (token.kind === "name") {
      if (token.value === "True") return { t: "lit", v: true };
      if (token.value === "False") return { t: "lit", v: false };
      if (token.value === "None") return { t: "lit", v: null };
      return { t: "name", path: [token.value] };
    }
    if (token.value === "(" || token.value === "[") {
      const close = token.value === "(" ? ")" : "]";
      const items: Node[] = [];
      let tuple = token.value === "[";
      while (!this.peek(close)) {
        items.push(this.ternary());
        if (!this.peek(close)) {
          this.eat(",");
          tuple = true;
        }
      }
      this.i++;
      return tuple || !items.length ? { t: "list", items } : items[0];
    }
    throw new Error("símbolo inesperado " + token.value);
  }
}

const cache = new Map<string, Node>();
function parse(expr: string) {
  let node = cache.get(expr);
  if (!node) {
    node = new Parser(tokenize(expr)).parse();
    if (cache.size > 2000) cache.clear();
    cache.set(expr, node);
  }
  return node;
}

export function truthy(value: unknown) {
  if (Array.isArray(value)) return value.length > 0;
  return !!value;
}
// Many2one vira o id; listas de registros viram lista de ids.
function plain(value: unknown): unknown {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    "id" in value
  )
    return (value as { id: unknown }).id;
  if (Array.isArray(value)) return value.map(plain);
  return value === undefined ? false : value;
}
function equal(a: unknown, b: unknown) {
  if (a === false || a === null) return b === false || b === null;
  return a === b;
}

function run(node: Node, scope: Scope): unknown {
  switch (node.t) {
    case "lit":
      return node.v;
    case "name": {
      let value: unknown = scope;
      for (const part of node.path) {
        if (value === null || typeof value !== "object") return false;
        value = (value as Record<string, unknown>)[part];
      }
      return node.path.length === 1 && node.path[0] === "parent"
        ? value
        : plain(value);
    }
    case "list":
      return node.items.map((item) => run(item, scope));
    case "not":
      return !truthy(run(node.arg, scope));
    case "neg":
      return -Number(run(node.arg, scope));
    case "bool": {
      const left = run(node.left, scope);
      if (node.op === "and")
        return truthy(left) ? run(node.right, scope) : left;
      return truthy(left) ? left : run(node.right, scope);
    }
    case "cond":
      return truthy(run(node.test, scope))
        ? run(node.then, scope)
        : run(node.other, scope);
    case "add": {
      const a = run(node.left, scope);
      const b = run(node.right, scope);
      if (node.op === "-") return Number(a) - Number(b);
      if (Array.isArray(a) && Array.isArray(b)) return [...a, ...b];
      if (typeof a === "string" && typeof b === "string") return a + b;
      return Number(a) + Number(b);
    }
    case "call":
      // context.get(...), funções de data etc. ficam indefinidas.
      return false;
    case "cmp": {
      const a = run(node.left, scope);
      const b = run(node.right, scope);
      switch (node.op) {
        case "==":
          return equal(a, b);
        case "!=":
          return !equal(a, b);
        case "<":
          return (a as number) < (b as number);
        case ">":
          return (a as number) > (b as number);
        case "<=":
          return (a as number) <= (b as number);
        case ">=":
          return (a as number) >= (b as number);
        case "in":
        case "not in": {
          const found = Array.isArray(b)
            ? b.some((item) => equal(item, a))
            : typeof b === "string" && typeof a === "string" && b.includes(a);
          return node.op === "in" ? found : !found;
        }
      }
    }
  }
  return false;
}

export function evaluate(expr: string, scope: Scope): unknown {
  return run(parse(expr), scope);
}

// Atributo do Odoo ("1", "True", expressão) → booleano. Erros contam como falso,
// para nunca esconder ou travar um campo por causa de uma expressão desconhecida.
export function check(expr: string | boolean | undefined | null, scope: Scope) {
  if (expr === undefined || expr === null || expr === false || expr === "")
    return false;
  if (expr === true) return true;
  try {
    return truthy(evaluate(expr, scope));
  } catch {
    return false;
  }
}

export function names(expr: string): string[] {
  const found = new Set<string>();
  const walk = (node: Node) => {
    switch (node.t) {
      case "name":
        if (node.path[0] !== "parent") found.add(node.path[0]);
        return;
      case "list":
        return node.items.forEach(walk);
      case "not":
      case "neg":
        return walk(node.arg);
      case "bool":
      case "cmp":
      case "add":
        walk(node.left);
        return walk(node.right);
      case "cond":
        walk(node.test);
        walk(node.then);
        return walk(node.other);
      case "call":
        return node.args.forEach(walk);
    }
  };
  try {
    walk(parse(expr));
  } catch {
    // expressão desconhecida: sem dependências
  }
  return [...found];
}
