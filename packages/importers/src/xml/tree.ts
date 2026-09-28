/** A small element tree for one record, built while streaming (see `recordStream.ts`). */
export interface XmlNode {
  name: string;
  attrs: Record<string, string>;
  /** Direct text content, untrimmed. */
  text: string;
  children: XmlNode[];
}

export function child(node: XmlNode, name: string): XmlNode | undefined {
  return node.children.find((c) => c.name === name);
}

export function children(node: XmlNode, name: string): XmlNode[] {
  return node.children.filter((c) => c.name === name);
}

/** Trimmed text of the first child with that name, or undefined when absent. */
export function text(node: XmlNode, name: string): string | undefined {
  const c = child(node, name);
  return c === undefined ? undefined : c.text.trim();
}

/** Non-empty `<text>` children (or another name) joined as paragraphs (DATA-FORMATS.md §2.1). */
export function textBlocks(node: XmlNode, name = 'text'): string {
  return children(node, name)
    .map((c) => c.text.trim())
    .filter((t) => t.length > 0)
    .join('\n\n');
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Serializes a node back to XML so unknown elements can be preserved verbatim in `data.extra`. */
export function serialize(node: XmlNode): string {
  const attrs = Object.entries(node.attrs)
    .map(([k, v]) => ` ${k}="${escapeXml(v)}"`)
    .join('');
  const inner = escapeXml(node.text) + node.children.map(serialize).join('');
  return inner.length === 0
    ? `<${node.name}${attrs}/>`
    : `<${node.name}${attrs}>${inner}</${node.name}>`;
}

/** Unknown children, serialized and grouped by element name. */
export function collectExtra(node: XmlNode, known: ReadonlySet<string>): Record<string, string[]> {
  const extra: Record<string, string[]> = {};
  for (const c of node.children) {
    if (known.has(c.name)) continue;
    (extra[c.name] ??= []).push(serialize(c));
  }
  return extra;
}
