// Avaliador dos domínios e contextos que o Odoo guarda como texto Python nas
// ações e filtros (ex.: "[('move_type', '=', 'out_invoice')]",
// "{'default_move_type': 'out_invoice', 'search_default_open': 1}").
// Aceita literais (texto, números, True/False/None, listas, tuplas,
// dicionários), nomes do contexto (uid, allowed_company_ids, active_id...) e
// not/and/or/in. Chamadas (context_today(), relativedelta...) não são
// avaliadas: o resultado vem marcado como incompleto.
type Scope = Record<string, unknown>;
type Token = { kind: "num" | "str" | "name" | "op"; value: string };

class Unsupported extends Error {}

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
      if (j >= source.length) throw new Unsupported("texto sem fim");
      tokens.push({ kind: "str", value });
      i = j + 1;
      continue;
    }
    const num = /^-?\d+(\.\d+)?/.exec(source.slice(i));
    if (num && (c !== "-" || !tokens.length || isOpen(tokens.at(-1)!))) {
      tokens.push({ kind: "num", value: num[0] });
      i += num[0].length;
      continue;
    }
    const name = /^[A-Za-z_][\w.]*/.exec(source.slice(i));
    if (name) {
      tokens.push({ kind: "name", value: name[0] });
      i += name[0].length;
      continue;
    }
    const op = ["==", "!=", "<=", ">="].find((o) => source.startsWith(o, i));
    if (op) {
      tokens.push({ kind: "op", value: op });
      i += 2;
      continue;
    }
    if ("()[]{},:<>|&!+-*/%.".includes(c)) {
      tokens.push({ kind: "op", value: c });
      i++;
      continue;
    }
    throw new Unsupported("caractere " + c);
  }
  return tokens;
}
const isOpen = (t: Token) =>
  t.kind === "op" && ["(", "[", "{", ",", ":"].includes(t.value);

// "lenient": nomes e chamadas desconhecidos valem None (para contextos, em
// que um valor a menos não muda o resto); senão a avaliação é recusada.
function parser(tokens: Token[], scope: Scope, lenient: boolean) {
  let pos = 0;
  const peek = () => tokens[pos];
  const isOp = (value: string) =>
    peek()?.kind === "op" && peek()?.value === value;
  const expect = (value: string) => {
    if (!isOp(value)) throw new Unsupported("esperado " + value);
    pos++;
  };
  const sequence = (close: string) => {
    const items: unknown[] = [];
    while (!isOp(close)) {
      items.push(expression());
      if (isOp(",")) pos++;
      else break;
    }
    expect(close);
    return items;
  };
  const atom = (): unknown => {
    const token = peek();
    if (!token) throw new Unsupported("fim inesperado");
    pos++;
    if (token.kind === "str") return token.value;
    if (token.kind === "num") return Number(token.value);
    if (token.kind === "op") {
      if (token.value === "(") {
        const items = sequence(")");
        return items.length === 1 ? items[0] : items;
      }
      if (token.value === "[") return sequence("]");
      if (token.value === "{") {
        const out: Record<string, unknown> = {};
        while (!isOp("}")) {
          const key = expression();
          expect(":");
          out[String(key)] = expression();
          if (isOp(",")) pos++;
          else break;
        }
        expect("}");
        return out;
      }
      throw new Unsupported("operador " + token.value);
    }
    if (token.value === "True") return true;
    if (token.value === "False") return false;
    if (token.value === "None") return null;
    // dicionario.get('chave', padrão), como context.get('default_move_type').
    if (isOp("(") && token.value.endsWith(".get")) {
      pos++;
      const args = sequence(")");
      let base: unknown = scope;
      for (const part of token.value.slice(0, -4).split(".")) {
        if (base === null || typeof base !== "object" || !(part in base)) {
          base = undefined;
          break;
        }
        base = (base as Record<string, unknown>)[part];
      }
      if (base === undefined && !lenient)
        throw new Unsupported("nome " + token.value);
      const found =
        base && typeof base === "object"
          ? (base as Record<string, unknown>)[String(args[0])]
          : undefined;
      return found === undefined ? (args[1] ?? null) : found;
    }
    if (isOp("(")) {
      if (!lenient) throw new Unsupported("chamada " + token.value);
      // Chamada e encadeamentos (ex.: context_today().strftime('%Y')).
      pos++;
      sequence(")");
      while (isOp(".")) {
        pos++;
        pos++;
        if (isOp("(")) {
          pos++;
          sequence(")");
        }
      }
      return null;
    }
    let value: unknown = scope;
    for (const part of token.value.split(".")) {
      if (value === null || typeof value !== "object" || !(part in value)) {
        if (!lenient) throw new Unsupported("nome " + token.value);
        return null;
      }
      value = (value as Record<string, unknown>)[part];
    }
    if (isOp("[")) {
      pos++;
      const index = expression();
      expect("]");
      return (value as Record<string, unknown>)?.[String(index)];
    }
    return value;
  };
  const unary = (): unknown => {
    if (peek()?.kind === "name" && peek()?.value === "not") {
      pos++;
      return !truthy(unary());
    }
    return atom();
  };
  const comparison = (): unknown => {
    const left = unary();
    const token = peek();
    if (token?.kind === "name" && token.value === "in") {
      pos++;
      const right = unary();
      return Array.isArray(right) && right.includes(left);
    }
    if (
      token?.kind === "name" &&
      token.value === "not" &&
      tokens[pos + 1]?.kind === "name" &&
      tokens[pos + 1].value === "in"
    ) {
      pos += 2;
      const right = unary();
      return !(Array.isArray(right) && right.includes(left));
    }
    if (token?.kind === "op" && ["==", "!="].includes(token.value)) {
      pos++;
      const right = unary();
      const same = JSON.stringify(left) === JSON.stringify(right);
      return token.value === "==" ? same : !same;
    }
    return left;
  };
  const expression = (): unknown => {
    let left = comparison();
    while (peek()?.kind === "name" && ["and", "or"].includes(peek()!.value)) {
      const op = peek()!.value;
      pos++;
      const right = comparison();
      left =
        op === "and"
          ? truthy(left)
            ? right
            : left
          : truthy(left)
            ? left
            : right;
    }
    if (peek()?.kind === "name" && peek()?.value === "if")
      throw new Unsupported("expressão condicional");
    return left;
  };
  return {
    run() {
      const value = expression();
      if (pos !== tokens.length) throw new Unsupported("sobrou texto");
      return value;
    },
  };
}

const truthy = (value: unknown) =>
  Array.isArray(value) ? value.length > 0 : !!value;

export function pyEval(
  source: unknown,
  scope: Scope,
  lenient = false,
): { ok: true; value: unknown } | { ok: false } {
  if (source === null || source === undefined || source === false)
    return { ok: true, value: null };
  if (typeof source !== "string") return { ok: true, value: source };
  if (!source.trim()) return { ok: true, value: null };
  try {
    return { ok: true, value: parser(tokenize(source), scope, lenient).run() };
  } catch (error) {
    if (error instanceof Unsupported) return { ok: false };
    throw error;
  }
}

// Domínio de ação ou filtro; null quando o Odoo usa funções (datas
// relativas etc.) que a ERA não avalia.
export function pyDomain(source: unknown, scope: Scope): unknown[] | null {
  const result = pyEval(source, scope);
  if (!result.ok) return null;
  if (result.value === null) return [];
  return Array.isArray(result.value) ? result.value : null;
}

export function pyContext(
  source: unknown,
  scope: Scope,
): Record<string, unknown> {
  const result = pyEval(source, scope, true);
  if (
    result.ok &&
    result.value &&
    typeof result.value === "object" &&
    !Array.isArray(result.value)
  )
    return result.value as Record<string, unknown>;
  return {};
}
