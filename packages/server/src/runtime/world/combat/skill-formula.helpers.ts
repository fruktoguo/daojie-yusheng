/**
 * 本文件属于服务端战斗运行时，负责战斗指令、结算辅助、表现投影或掉落处理。
 *
 * 维护时要保证结算仍由服务端权威执行，客户端只接收结构化结果和必要表现字段。
 */
/** 技能公式变量解析上下文 */
export interface SkillFormulaContext {
  /** 施法者属性 */
  casterAttrs: Record<string, number>;
  /** 施法者等级/境界 */
  casterLevel: number;
  /** 技能等级 */
  skillLevel: number;
  /** 目标属性（可选，用于防御计算） */
  targetAttrs?: Record<string, number>;
  /** 目标等级 */
  targetLevel?: number;
  /** 额外变量 */
  extraVars?: Record<string, number>;
}

export interface FormulaToken {
  type: 'number' | 'variable' | 'operator' | 'function';
  value: string;
}

const KNOWN_FUNCTIONS = new Set(['min', 'max', 'floor', 'ceil', 'abs']);

/** 解析公式中的变量引用 */
export function resolveSkillFormulaVar(
  varName: string,
  ctx: SkillFormulaContext,
): number {
  switch (varName) {
    case 'atk':
      return ctx.casterAttrs['atk'] ?? 0;
    case 'def':
      return ctx.casterAttrs['def'] ?? 0;
    case 'hp':
      return ctx.casterAttrs['hp'] ?? 0;
    case 'maxHp':
      return ctx.casterAttrs['maxHp'] ?? 0;
    case 'qi':
      return ctx.casterAttrs['qi'] ?? 0;
    case 'maxQi':
      return ctx.casterAttrs['maxQi'] ?? 0;
    case 'str':
      return ctx.casterAttrs['str'] ?? 0;
    case 'agi':
      return ctx.casterAttrs['agi'] ?? 0;
    case 'int':
      return ctx.casterAttrs['int'] ?? 0;
    case 'con':
      return ctx.casterAttrs['con'] ?? 0;
    case 'spi':
      return ctx.casterAttrs['spi'] ?? 0;
    case 'level':
      return ctx.casterLevel;
    case 'skillLevel':
      return ctx.skillLevel;
    case 'targetDef':
      return ctx.targetAttrs?.['def'] ?? 0;
    case 'targetLevel':
      return ctx.targetLevel ?? 0;
    default:
      if (varName.startsWith('target.') && ctx.targetAttrs) {
        return ctx.targetAttrs[varName.slice(7)] ?? 0;
      }
      return ctx.extraVars?.[varName] ?? ctx.casterAttrs[varName] ?? 0;
  }
}

/** 解析公式字符串为 token 列表（用于调试/展示） */
export function parseSkillFormulaTokens(formula: string): FormulaToken[] {
  const tokens: FormulaToken[] = [];
  let i = 0;
  while (i < formula.length) {
    const ch = formula[i];
    if (ch === ' ' || ch === '\t') {
      i++;
      continue;
    }
    if (ch === '+' || ch === '-' || ch === '*' || ch === '/' || ch === '(' || ch === ')' || ch === ',') {
      tokens.push({ type: 'operator', value: ch });
      i++;
      continue;
    }
    if (ch >= '0' && ch <= '9' || ch === '.') {
      let num = '';
      while (i < formula.length && (formula[i] >= '0' && formula[i] <= '9' || formula[i] === '.')) {
        num += formula[i++];
      }
      tokens.push({ type: 'number', value: num });
      continue;
    }
    if (isIdentStart(ch)) {
      let ident = '';
      while (i < formula.length && isIdentChar(formula[i])) {
        ident += formula[i++];
      }
      if (KNOWN_FUNCTIONS.has(ident) && i < formula.length && formula[i] === '(') {
        tokens.push({ type: 'function', value: ident });
      } else {
        tokens.push({ type: 'variable', value: ident });
      }
      continue;
    }
    i++;
  }
  return tokens;
}

/** 计算技能公式最终数值 */
export function evaluateSkillFormula(
  formula: string,
  ctx: SkillFormulaContext,
): number {
  const tokens = parseSkillFormulaTokens(formula);
  let pos = 0;

  function peek(): FormulaToken | undefined {
    return tokens[pos];
  }
  function consume(): FormulaToken {
    return tokens[pos++];
  }

  function parseExpr(): number {
    let result = parseTerm();
    while (peek()?.value === '+' || peek()?.value === '-') {
      const op = consume().value;
      const right = parseTerm();
      result = op === '+' ? result + right : result - right;
    }
    return result;
  }

  function parseTerm(): number {
    let result = parseUnary();
    while (peek()?.value === '*' || peek()?.value === '/') {
      const op = consume().value;
      const right = parseUnary();
      result = op === '*' ? result * right : (right === 0 ? 0 : result / right);
    }
    return result;
  }

  function parseUnary(): number {
    if (peek()?.value === '-') {
      consume();
      return -parsePrimary();
    }
    if (peek()?.value === '+') {
      consume();
    }
    return parsePrimary();
  }

  function parsePrimary(): number {
    const token = peek();
    if (!token) return 0;

    if (token.type === 'number') {
      consume();
      return parseFloat(token.value) || 0;
    }

    if (token.type === 'function') {
      const fnName = consume().value;
      consume(); // '('
      const args: number[] = [];
      if (peek()?.value !== ')') {
        args.push(parseExpr());
        while (peek()?.value === ',') {
          consume();
          args.push(parseExpr());
        }
      }
      if (peek()?.value === ')') consume();
      return applyFunction(fnName, args);
    }

    if (token.type === 'variable') {
      consume();
      return resolveSkillFormulaVar(token.value, ctx);
    }

    if (token.value === '(') {
      consume();
      const result = parseExpr();
      if (peek()?.value === ')') consume();
      return result;
    }

    consume();
    return 0;
  }

  return parseExpr();
}

function applyFunction(name: string, args: number[]): number {
  switch (name) {
    case 'min':
      return args.length > 0 ? Math.min(...args) : 0;
    case 'max':
      return args.length > 0 ? Math.max(...args) : 0;
    case 'floor':
      return Math.floor(args[0] ?? 0);
    case 'ceil':
      return Math.ceil(args[0] ?? 0);
    case 'abs':
      return Math.abs(args[0] ?? 0);
    default:
      return 0;
  }
}

function isIdentStart(ch: string): boolean {
  return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_';
}

function isIdentChar(ch: string): boolean {
  return isIdentStart(ch) || (ch >= '0' && ch <= '9') || ch === '.';
}
