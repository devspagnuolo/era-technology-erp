// Leitor mínimo do XML das telas (arch) que o próprio Odoo gera em get_views.
// O XML vem do servidor Odoo e é bem-formado; não há DTD nem entidades externas.
export type ArchNode = {
  tag: string;
  attrs: Record<string, string>;
  children: ArchNode[];
};

const entities: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};
function decode(text: string) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (match, code: string) => {
    if (code[0] === "#")
      return String.fromCodePoint(
        code[1] === "x" || code[1] === "X"
          ? parseInt(code.slice(2), 16)
          : parseInt(code.slice(1), 10),
      );
    return entities[code] ?? match;
  });
}

export function parseArch(xml: string): ArchNode {
  const root: ArchNode = { tag: "#root", attrs: {}, children: [] };
  const stack = [root];
  const tag =
    /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<\/([\w:.-]+)\s*>|<([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;
  const attr = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let match: RegExpExecArray | null;
  while ((match = tag.exec(xml))) {
    const [, close, open, rawAttrs, selfClosing] = match;
    if (close) {
      if (stack.length > 1) stack.pop();
      continue;
    }
    if (!open) continue;
    const node: ArchNode = { tag: open, attrs: {}, children: [] };
    let a: RegExpExecArray | null;
    attr.lastIndex = 0;
    while ((a = attr.exec(rawAttrs ?? "")))
      node.attrs[a[1]] = decode(a[2] ?? a[3] ?? "");
    stack[stack.length - 1].children.push(node);
    if (!selfClosing) stack.push(node);
  }
  return root.children[0] ?? root;
}
