const SKIP_KEYWORDS = new Set([
  'if',
  'for',
  'while',
  'switch',
  'catch',
  'else',
  'try',
  'finally',
  'return',
  'new',
  'delete',
  'super',
  'this',
  'await',
  'yield',
  'class',
  'interface',
  'type',
  'enum',
  'in',
  'of',
  'case',
  'from',
  'import',
]);

const GENERATED_COMMENT = /^\/\*\* .+：.*。 \*\/$/;

function isMethodLikeLine(line) {
  const trimmed = line.trim();
  if (!/^\s{2,}/.test(line) || (!trimmed.endsWith(';') && !trimmed.endsWith('{'))) {
    return false;
  }
  if (trimmed.endsWith(';') && !trimmed.includes('=>') && !/:\s*[^=]+;\s*$/.test(trimmed)) {
    return false;
  }
  if (trimmed.endsWith('{') && trimmed.includes('=>')) {
    return false;
  }
  return true;
}

function isMethodNameExcluded(name) {
  return SKIP_KEYWORDS.has(name);
}

export function detectDeclarationFromLine(line) {
  let m = line.match(/^\s*(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)\b/);
  if (m) {
    return { kind: 'interface', name: m[1] };
  }

  m = line.match(/^\s*(?:export\s+)?type\s+([A-Za-z_$][\w$]*)\b/);
  if (m && !line.trim().endsWith(',')) {
    return { kind: 'type', name: m[1] };
  }

  m = line.match(/^\s*(?:export\s+)?enum\s+([A-Za-z_$][\w$]*)\b/);
  if (m) {
    return { kind: 'enum', name: m[1] };
  }

  m = line.match(/^\s*(?:export\s+)?class\s+([A-Za-z_$][\w$]*)\b/);
  if (m) {
    return { kind: 'class', name: m[1] };
  }

  m = line.match(/^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\b/);
  if (m) {
    return { kind: 'function', name: m[1] };
  }

  m = line.match(/^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)\s*=>|<[^>]+>\s*\([^)]*\)\s*=>)/);
  if (m) {
    return { kind: 'constFunction', name: m[1] };
  }

  m = line.match(/^\s{2,}(?:(?:public|private|protected)\s+)?(?:static\s+)?(?:readonly\s+)?(?:async\s+)?(?:get\s+|set\s+)?(constructor|[A-Za-z_$][\w$]*)\s*(?:<[^>]*>)?\s*\([^)]*\)\s*(\s*:\s*[^;{]+;)?\s*(\{|;)/);
  if (m && isMethodLikeLine(line)) {
    const name = m[1];
    if (isMethodNameExcluded(name)) {
      return null;
    }
    return { kind: 'method', name };
  }

  m = line.match(/^\s{2,}(?:(?:public|private|protected)\s+)?(?:readonly\s+)?(?:async\s+)?([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)\s*=>|<[^>]+>\s*\([^)]*\)\s*=>)/);
  if (m) {
    return { kind: 'fieldFunction', name: m[1] };
  }

  return null;
}

export function isGeneratedComment(line) {
  return GENERATED_COMMENT.test(line.trim());
}
