/**
 * Safe spreadsheet-style formula evaluator for per-bank eligibility formulas.
 *
 * Supports: + - * / ^, parentheses, unary minus, decimal numbers,
 * min(a, b, ...) / max(a, b, ...), and identifiers resolved from a fixed
 * variable map. No eval()/Function() — a hand-rolled tokenizer + recursive
 * descent parser only ever produces +,-,*,/,^,min,max nodes, so a formula
 * can't do anything beyond arithmetic on the variables it's given.
 */

export const FORMULA_VARIABLES = [
  'grossSalary',
  'netSalary',
  'coapplicantGross',
  'rentalIncome',
  'pf',
  'incomeTax',
  'professionTax',
  'totalDeductions',
  'netIncome',
  'totalExistingEmis',
  'emiAvailable',
  'rate',
  'period',
  'emiNmiPercent',
  'emiPerLac',
] as const;

export type FormulaVars = Partial<Record<(typeof FORMULA_VARIABLES)[number], number>>;

type Token =
  | { type: 'num'; value: number }
  | { type: 'ident'; value: string }
  | { type: 'op'; value: string }
  | { type: 'lparen' }
  | { type: 'rparen' }
  | { type: 'comma' };

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < input.length && /[0-9.]/.test(input[j])) j++;
      const raw = input.slice(i, j);
      const value = Number(raw);
      if (Number.isNaN(value)) throw new Error(`Invalid number "${raw}"`);
      tokens.push({ type: 'num', value });
      i = j;
      continue;
    }
    if (/[a-zA-Z_]/.test(ch)) {
      let j = i;
      while (j < input.length && /[a-zA-Z0-9_]/.test(input[j])) j++;
      tokens.push({ type: 'ident', value: input.slice(i, j) });
      i = j;
      continue;
    }
    if ('+-*/^'.includes(ch)) { tokens.push({ type: 'op', value: ch }); i++; continue; }
    if (ch === '(') { tokens.push({ type: 'lparen' }); i++; continue; }
    if (ch === ')') { tokens.push({ type: 'rparen' }); i++; continue; }
    if (ch === ',') { tokens.push({ type: 'comma' }); i++; continue; }
    throw new Error(`Unexpected character "${ch}"`);
  }
  return tokens;
}

// Grammar: expr := term (('+'|'-') term)*
//          term := unary (('*'|'/') unary)*
//          unary := '-' unary | power
//          power := atom ('^' unary)?
//          atom  := number | ident | ident '(' args ')' | '(' expr ')'
class Parser {
  tokens: Token[];
  pos = 0;
  constructor(tokens: Token[]) { this.tokens = tokens; }

  peek(): Token | undefined { return this.tokens[this.pos]; }
  next(): Token | undefined { return this.tokens[this.pos++]; }

  parseExpr(): number {
    let value = this.parseTerm();
    for (;;) {
      const t = this.peek();
      if (t && t.type === 'op' && (t.value === '+' || t.value === '-')) {
        this.next();
        const rhs = this.parseTerm();
        value = t.value === '+' ? value + rhs : value - rhs;
      } else break;
    }
    return value;
  }

  parseTerm(): number {
    let value = this.parseUnary();
    for (;;) {
      const t = this.peek();
      if (t && t.type === 'op' && (t.value === '*' || t.value === '/')) {
        this.next();
        const rhs = this.parseUnary();
        value = t.value === '*' ? value * rhs : value / rhs;
      } else break;
    }
    return value;
  }

  parseUnary(): number {
    const t = this.peek();
    if (t && t.type === 'op' && t.value === '-') {
      this.next();
      return -this.parseUnary();
    }
    return this.parsePower();
  }

  parsePower(): number {
    const base = this.parseAtom();
    const t = this.peek();
    if (t && t.type === 'op' && t.value === '^') {
      this.next();
      const exp = this.parseUnary();
      return Math.pow(base, exp);
    }
    return base;
  }

  parseAtom(): number {
    const t = this.next();
    if (!t) throw new Error('Unexpected end of formula');
    if (t.type === 'num') return t.value;
    if (t.type === 'lparen') {
      const value = this.parseExpr();
      const close = this.next();
      if (!close || close.type !== 'rparen') throw new Error('Missing closing ")"');
      return value;
    }
    if (t.type === 'ident') {
      const nextTok = this.peek();
      if (nextTok && nextTok.type === 'lparen') {
        this.next();
        const args: number[] = [this.parseExpr()];
        while (this.peek()?.type === 'comma') {
          this.next();
          args.push(this.parseExpr());
        }
        const close = this.next();
        if (!close || close.type !== 'rparen') throw new Error('Missing closing ")"');
        if (t.value === 'min') return Math.min(...args);
        if (t.value === 'max') return Math.max(...args);
        throw new Error(`Unknown function "${t.value}" — only min() and max() are supported`);
      }
      if (!(this.vars && t.value in this.vars)) {
        throw new Error(`Unknown variable "${t.value}"`);
      }
      return this.vars[t.value] as number;
    }
    throw new Error('Invalid formula syntax');
  }

  vars: FormulaVars = {};
}

/**
 * Evaluate a spreadsheet-style formula string against a set of variables.
 * Returns { value } on success, or { error } if the formula is invalid or
 * references an unknown variable/function.
 */
export function evaluateFormula(
  formula: string,
  vars: FormulaVars
): { value: number | null; error: string | null } {
  if (!formula || !formula.trim()) return { value: null, error: null };
  try {
    const tokens = tokenize(formula);
    const parser = new Parser(tokens);
    parser.vars = vars;
    const value = parser.parseExpr();
    if (parser.pos < tokens.length) throw new Error('Unexpected trailing characters');
    if (!Number.isFinite(value)) throw new Error('Formula did not produce a finite number');
    return { value, error: null };
  } catch (err: any) {
    return { value: null, error: err?.message || 'Invalid formula' };
  }
}
