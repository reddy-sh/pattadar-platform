/**
 * Owner-facing copy, pulled out of source for the naming guardrails
 * (`scripts/vocab-tests.ts`, design.md § Naming standard).
 *
 * A guard about words must read words, not code: an identifier, a route, a
 * GraphQL field, an enum compared with `===`, a className or a comment is
 * never copy. So each language is parsed (TypeScript's own parser for TS/TSX,
 * Python's `ast` for the server) and only the literals that can reach a
 * screen are returned:
 *
 * - TS/TSX: JSX text, string and template literals, except module specifiers,
 *   type positions, property keys, element access, `===`/`case` operands,
 *   tagged templates (gql), non-copy JSX attributes (className, to, href…)
 *   and arguments to plumbing calls (fetch, navigate, console, storage…).
 * - Swift: single-line string literals outside comments; `"""` blocks are
 *   GraphQL documents and are skipped, as are literals inside plumbing calls.
 * - Swift: `#if DEBUG` blocks are developer builds and are skipped.
 * - Python: string constants and f-string text, except docstrings, dict keys,
 *   `==`/`in` operands, logging calls, SQL and a filing plan's `why`.
 *
 * Every literal must then look like words (JSX text always does; a string
 * needs a space or a leading capital), so `'job'` the enum is not "job" the
 * noun. Template and f-string holes read as `{…}`.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

import { lineAt } from './source-scan';

const ROOT = join(import.meta.dir, '..', '..');
// The parser API. apps/web is on TypeScript 7 (the native compiler, which has
// no JS API); apps/mobile still installs 6.x, whose `createSourceFile` this
// uses. vocab-tests already depends on apps/mobile for normalizeHoldings.
const ts: typeof import('typescript') = createRequire(join(ROOT, 'apps/mobile/package.json'))('typescript');
if (typeof ts.createSourceFile !== 'function') {
  throw new Error('copy-strings needs a TypeScript with a JS parser API (apps/mobile/node_modules/typescript 6.x)');
}

/** `attr` is the JSX attribute a literal sits in (`placeholder`, `aria-label`…). */
export type Copy = { file: string; line: number; text: string; kind: 'jsx' | 'str' | 'attr'; attr?: string };

/** Attributes that carry code, not words. */
const NON_COPY_ATTR = new Set([
  'className', 'class', 'to', 'href', 'src', 'srcSet', 'key', 'id', 'type', 'name', 'role', 'htmlFor',
  'variant', 'size', 'color', 'tone', 'icon', 'autoComplete', 'inputMode', 'pattern', 'method', 'target',
  'rel', 'as', 'accept', 'form', 'lang', 'dir', 'mode', 'kind', 'align', 'justify', 'style', 'value',
  'defaultValue', 'testId', 'path', 'viewBox', 'd', 'fill', 'stroke', 'transform', 'points', 'width',
  'height', 'xmlns', 'preload', 'loading', 'decoding', 'enterKeyHint', 'capture', 'step', 'min', 'max',
  'wrap', 'gap', 'ratio', 'state', 'status', 'shelf', 'scheme', 'theme', 'layout', 'position', 'side',
  'placement', 'fit', 'area', 'grid', 'cols', 'span', 'sort', 'order', 'field', 'unit', 'format',
]);
/** Calls whose string arguments are plumbing. */
const PLUMBING_CALL = /^(fetch|navigate|useNavigate|redirect|console\.\w+|localStorage\.\w+|sessionStorage\.\w+|\w+\.(get|set|has|delete|append|getItem|setItem|removeItem|includes|startsWith|endsWith|indexOf|split|replace|replaceAll|match|test|querySelector|querySelectorAll|getElementById|addEventListener|removeEventListener|getPropertyValue|setProperty|matchMedia|postMessage|join|padStart|toLocaleString|toLocaleDateString|toLocaleTimeString)|new (URL|URLSearchParams|RegExp|Date|Intl\.\w+|Event|CustomEvent|Blob|File|Worker)|matchMedia|cssVar|getComputedStyle|require|import|useQuery|useMutation|useSuspenseQuery|useInfiniteQuery|gql|graphql|request|apiFetch|api\.\w+|gqlRequest|query|mutate|track|createElement|document\.\w+|window\.\w+|clsx|cx|cn|RegExp|Symbol|structuredClone|useSearchParams|setSearchParams|params\.\w+|searchParams\.\w+|describe|it|test|expect)$/;

const looksLikeWords = (t: string) =>
  /[A-Za-z]/.test(t)
  && (/[A-Za-z]\s+[A-Za-z{]/.test(t) || /^[A-Z][a-z]/.test(t.trim()))
  && !/^\/(?:[\w:{}.?=&-]+\/?)*$/.test(t.trim()) // a path
  && !/^https?:\/\//.test(t.trim())
  && !/var\(--|^\s*[\w-]+:\s*[^ ]+;|\d+px\b/.test(t)
  && !(/-/.test(t) && /^[a-z0-9:/[\]._%!-]+(\s+[a-z0-9:/[\]._%!-]+)*$/.test(t.trim())) // a class list
  && !/^\s*(query|mutation|fragment|subscription)\b/.test(t)
  && !/^\s*\{\s*\w+\s*[({]/.test(t) // a GraphQL selection
  && !/\b(SELECT|INSERT INTO|UPDATE \w+ SET|DELETE FROM|WHERE|JOIN|CREATE (TABLE|INDEX|UNIQUE)|ALTER TABLE)\b/.test(t)
  && !/\{\s*\w+(\s+\w+)+\s*\}/.test(t); // a GraphQL selection set

function calleeText(node: import('typescript').Node, sf: import('typescript').SourceFile): string {
  return node.getText(sf).replace(/\s+/g, '').replace(/\?\./g, '.');
}

/** Owner-facing literals in a TS/TSX file. */
export function tsCopy(file: string, src: string): Copy[] {
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true,
    file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out: Copy[] = [];
  const push = (node: import('typescript').Node, text: string, kind: Copy['kind'], attr?: string) => {
    if (!looksLikeWords(text) && kind !== 'jsx') return;
    if (kind === 'jsx' && !/[A-Za-z]/.test(text)) return;
    out.push({ file, line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1, text: text.replace(/\s+/g, ' ').trim(), kind, ...(attr ? { attr } : {}) });
  };
  const skip = (node: import('typescript').Node): boolean => {
    const p = node.parent;
    if (!p) return false;
    if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isExternalModuleReference(p)) return true;
    if (ts.isLiteralTypeNode(p)) return true;
    if ((ts.isPropertyAssignment(p) || ts.isPropertySignature(p) || ts.isPropertyDeclaration(p) || ts.isMethodDeclaration(p)) && p.name === node) return true;
    if (ts.isElementAccessExpression(p) && p.argumentExpression === node) return true;
    if (ts.isCaseClause(p)) return true;
    if (ts.isBinaryExpression(p) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken,
      ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken, ts.SyntaxKind.InKeyword].includes(p.operatorToken.kind)) return true;
    if (ts.isTaggedTemplateExpression(p)) return true;
    if (ts.isJsxAttribute(p)) {
      const n = p.name.getText(sf);
      return NON_COPY_ATTR.has(n) || n.startsWith('data-') || n.startsWith('on');
    }
    if (ts.isJsxExpression(p) && p.parent && ts.isJsxAttribute(p.parent)) {
      const n = p.parent.name.getText(sf);
      return NON_COPY_ATTR.has(n) || n.startsWith('data-');
    }
    if ((ts.isCallExpression(p) || ts.isNewExpression(p)) && p.expression !== node) {
      const callee = (ts.isNewExpression(p) ? 'new ' : '') + calleeText(p.expression, sf);
      if (PLUMBING_CALL.test(callee)) return true;
    }
    return false;
  };
  const visit = (node: import('typescript').Node) => {
    if (ts.isJsxText(node)) {
      const t = node.getText(sf);
      if (t.trim()) push(node, t, 'jsx');
    } else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (!skip(node)) {
        const a = ts.isJsxAttribute(node.parent) ? node.parent
          : ts.isJsxExpression(node.parent) && ts.isJsxAttribute(node.parent.parent) ? node.parent.parent : undefined;
        push(node, node.text, a ? 'attr' : 'str', a?.name.getText(sf));
      }
    } else if (ts.isTemplateExpression(node)) {
      if (!skip(node)) {
        const text = node.head.text + node.templateSpans.map((s) => `{…}${s.literal.text}`).join('');
        push(node, text, 'str');
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

/** Strip Swift `//` and block comments, keeping strings and newlines. */
function stripSwiftComments(src: string): string {
  let out = '';
  let i = 0;
  while (i < src.length) {
    if (src.startsWith('"""', i)) {
      const end = src.indexOf('"""', i + 3);
      const stop = end < 0 ? src.length : end + 3;
      // A """ block is a GraphQL document or a long prompt, never a label:
      // blank it, keeping its newlines so line numbers hold.
      out += src.slice(i, stop).replace(/[^\n]/g, ' ');
      i = stop;
      continue;
    }
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i += 1; continue; }
    if (c === '/' && src[i + 1] === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') out += '\n'; i += 1; }
      i += 2;
      continue;
    }
    if (c === '"') {
      out += c; i += 1;
      while (i < src.length && src[i] !== '\n') {
        if (src[i] === '\\') { out += src.slice(i, i + 2); i += 2; continue; }
        out += src[i];
        if (src[i] === '"') { i += 1; break; }
        i += 1;
      }
      continue;
    }
    out += c; i += 1;
  }
  return out;
}

/** Blank `#if DEBUG … #endif` (up to an `#else`): developer builds only, so
 *  never in front of an owner. Newlines survive, so line numbers hold. */
function blankDebugBlocks(code: string): string {
  const lines = code.split('\n');
  let depth = 0; // nesting inside a DEBUG branch
  let inner = 0; // other #if blocks opened inside it
  return lines.map((l) => {
    const t = l.trim();
    if (depth === 0) {
      if (/^#if\s+DEBUG\b/.test(t)) { depth = 1; inner = 0; return ''; }
      return l;
    }
    if (/^#if\b/.test(t)) { inner += 1; return ''; }
    if (/^#endif\b/.test(t)) { if (inner > 0) { inner -= 1; return ''; } depth = 0; return ''; }
    if (/^#else\b/.test(t) && inner === 0) { depth = 0; return ''; }
    return l.replace(/[^\n]/g, ' ');
  }).join('\n');
}

const SWIFT_PLUMBING = /(\bLogger\b|\blog\.\w+|\bprint|NSLog|os_log|UserDefaults|AppStorage|SceneStorage|accessibilityIdentifier|forKey|Notification\.Name|URL\(string|URLQueryItem|setValue|forHTTPHeaderField|value\(forHTTPHeaderField|addValue|\.appendingPathComponent|systemName|systemImage|Image|named|\.contains|hasPrefix|hasSuffix|replacingOccurrences|components\(separatedBy|range\(of|Bundle|NSPredicate|DateFormatter|dateFormat|fileExtension|UTType|identifier|kind|\bcase|==|!=|\w\[)\s*[:(=]?\s*$/;

/** Owner-facing string literals in a Swift file. `\(…)` holes read as `{…}`;
 *  the strings inside a hole are copy too and are returned on their own. */
export function swiftCopy(file: string, src: string): Copy[] {
  const code = blankDebugBlocks(stripSwiftComments(src));
  const out: Copy[] = [];
  const interp = /\\\((?:[^()\n]|\((?:[^()\n]|\([^()\n]*\))*\))*\)/g;
  const lit = /"((?:[^"\\\n]|\\.)*)"/g;
  // Blank interpolations first so `"\(n == 1 ? "" : "s")"` is one literal.
  const inner: { text: string; index: number }[] = [];
  const flat = code.replace(interp, (m, at: number) => {
    for (const s of m.matchAll(lit)) inner.push({ text: s[1], index: at + (s.index ?? 0) });
    return `\\(${'…'.padEnd(m.length - 3, ' ')})`;
  });
  const all = [...[...flat.matchAll(lit)].map((m) => ({ text: m[1].replace(/\\\(…\s*\)/g, '{…}'), index: m.index ?? 0 })), ...inner];
  for (const s of all) {
    const before = flat.slice(Math.max(0, flat.lastIndexOf('\n', s.index) + 1), s.index);
    if (SWIFT_PLUMBING.test(before)) continue;
    if (!looksLikeWords(s.text)) continue;
    out.push({ file, line: lineAt(code, s.index), text: s.text, kind: 'str' });
  }
  return out;
}

const PY_EXTRACT = String.raw`
import ast, json, sys
out = []
LOG = {'debug','info','warning','error','exception','critical','log'}
for path in sys.argv[1:]:
    src = open(path, encoding='utf-8').read()
    tree = ast.parse(src)
    skip = set()
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef, ast.Module)) and node.body:
            first = node.body[0]
            if isinstance(first, ast.Expr) and isinstance(first.value, ast.Constant) and isinstance(first.value.value, str):
                skip.add(id(first.value))
        if isinstance(node, ast.Dict):
            for k, v in zip(node.keys, node.values):
                if k is not None: skip.add(id(k))
                # A filing plan's "why" is the engineer's reason, kept on the
                # deliverable for the desk (ticketing.py), not owner copy.
                if isinstance(k, ast.Constant) and k.value == 'why':
                    for c in ast.walk(v): skip.add(id(c))
        if isinstance(node, ast.Compare):
            if any(isinstance(o, (ast.Eq, ast.NotEq, ast.In, ast.NotIn)) for o in node.ops):
                for n in [node.left, *node.comparators]:
                    for c in ast.walk(n): skip.add(id(c))
        if isinstance(node, ast.Subscript):
            for c in ast.walk(node.slice): skip.add(id(c))
        if isinstance(node, ast.Call):
            for kw in node.keywords:
                if kw.arg == 'why':
                    for c in ast.walk(kw.value): skip.add(id(c))
            f = node.func
            name = f.attr if isinstance(f, ast.Attribute) else (f.id if isinstance(f, ast.Name) else '')
            owner = f.value.id if isinstance(f, ast.Attribute) and isinstance(f.value, ast.Name) else ''
            if name in LOG and owner not in ('', 'self') or name in ('getenv', 'get', 'execute', 'fetch', 'fetchrow', 'fetchval', 'text', 'compile', 'match', 'sub', 'search', 'startswith', 'endswith', 'split', 'replace', 'strftime', 'strptime', 'encode', 'decode', 'join', 'setdefault', 'pop', 'Field', 'Depends', 'Header', 'APIRouter') or owner in ('os', 're', 'json', 'logging', 'log', '_log', 'logger'):
                for a in [*node.args, *[k.value for k in node.keywords]]:
                    for c in ast.walk(a): skip.add(id(c))
    for node in ast.walk(tree):
        if isinstance(node, ast.JoinedStr):
            text = ''.join(v.value if isinstance(v, ast.Constant) else '{…}' for v in node.values)
            if id(node) not in skip:
                out.append([path, node.lineno, text])
            for v in node.values: skip.add(id(v))
    for node in ast.walk(tree):
        if isinstance(node, ast.Constant) and isinstance(node.value, str) and id(node) not in skip:
            out.append([path, node.lineno, node.value])
json.dump(out, sys.stdout)
`;

/** Owner-facing string constants in Python files (repo-relative paths). */
export function pyCopy(files: string[]): Copy[] {
  if (files.length === 0) return [];
  const r = spawnSync('python3', ['-c', PY_EXTRACT, ...files], { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`python string extraction failed: ${r.stderr}`);
  return (JSON.parse(r.stdout) as [string, number, string][])
    .filter(([, , t]) => looksLikeWords(t) && !t.includes('\n\n'))
    .map(([file, line, text]) => ({ file, line, text: text.replace(/\s+/g, ' ').trim(), kind: 'str' as const }));
}

export const readRel = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');
