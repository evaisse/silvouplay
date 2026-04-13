type FrontmatterPrimitive = string | number | boolean | null;
export type FrontmatterValue = FrontmatterPrimitive | FrontmatterPrimitive[];

function parseScalar(raw: string): FrontmatterPrimitive | FrontmatterPrimitive[] {
  const value = raw.trim();
  if (value === '[]') {
    return [];
  }
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  if (value === 'null') {
    return null;
  }
  if (/^-?\d+$/.test(value)) {
    return Number.parseInt(value, 10);
  }
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function renderScalar(value: FrontmatterPrimitive): string {
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value === null) {
    return 'null';
  }
  return JSON.stringify(value);
}

export function parseFrontmatter(content: string): {
  data: Record<string, FrontmatterValue>;
  body: string;
} {
  if (!content.startsWith('---\n')) {
    return { data: {}, body: content };
  }

  const end = content.indexOf('\n---\n', 4);
  if (end === -1) {
    throw new Error('Invalid frontmatter block.');
  }

  const raw = content.slice(4, end);
  const body = content.slice(end + 5);
  const lines = raw.split('\n');
  const data: Record<string, FrontmatterValue> = {};

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) {
      continue;
    }

    const match = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!match) {
      throw new Error(`Invalid frontmatter line: ${line}`);
    }

    const [, key, rest] = match;
    if (rest.length > 0) {
      data[key] = parseScalar(rest);
      continue;
    }

    const items: FrontmatterPrimitive[] = [];
    while (index + 1 < lines.length && /^\s*-\s+/.test(lines[index + 1])) {
      index += 1;
      items.push(parseScalar(lines[index].replace(/^\s*-\s+/, '')) as FrontmatterPrimitive);
    }
    data[key] = items;
  }

  return { data, body };
}

export function renderFrontmatter(data: Record<string, FrontmatterValue>): string {
  const lines = ['---'];

  for (const [key, value] of Object.entries(data)) {
    if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${key}: []`);
        continue;
      }
      lines.push(`${key}:`);
      for (const entry of value) {
        lines.push(`  - ${renderScalar(entry)}`);
      }
      continue;
    }
    lines.push(`${key}: ${renderScalar(value)}`);
  }

  lines.push('---', '');
  return lines.join('\n');
}
