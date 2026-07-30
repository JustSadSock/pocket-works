const DEG = Math.PI / 180;

export class ScadError extends Error {
  constructor(message, token) {
    super(token ? `${message} (строка ${token.line}, столбец ${token.col})` : message);
    this.name = 'ScadError';
    this.line = token?.line;
    this.col = token?.col;
  }
}

export function compileOpenScad(source, entries = []) {
  const parser = new Parser(tokenize(source));
  const program = parser.parseProgram();
  const runtime = new Runtime(program);
  const targets = entries.length ? entries : [{ id: 'model', name: 'Model', color: '#d9dfd3', entry: '__top__' }];
  const parts = targets.map((part, index) => {
    const entry = part.entry || part.module || part.id;
    const args = part.args && typeof part.args === 'object' ? part.args : {};
    const result = entry === '__top__' ? runtime.evaluateTop() : runtime.evaluateModule(entry, args);
    if (!result.nodes.length) throw new ScadError(`Точка входа «${entry}» не создала 3D-геометрию.`);
    return {
      id: cleanId(part.id || `part-${index + 1}`),
      name: String(part.name || part.id || `Деталь ${index + 1}`).slice(0, 80),
      color: normalizeColor(part.color),
      visible: part.visible !== false,
      node: combine('union', result.nodes),
      meta: {
        ...(part.meta || {}),
        cadEntry: entry,
        mechanics: part.mechanics || null,
        scadEvidence: result.evidence
      }
    };
  });
  return { parts, evidence: runtime.evidence };
}

export function looksLikeScad(text) {
  const source = String(text || '');
  return /\b(module|cube|sphere|cylinder|translate|difference|union)\s*\(/.test(source) && !/^\s*\{/.test(source);
}

function cleanId(value) {
  return String(value).trim().replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'part';
}

function normalizeColor(value) {
  const color = String(value || '#d9dfd3');
  return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : '#d9dfd3';
}

function combine(type, nodes) {
  if (nodes.length === 1) return nodes[0];
  return { type, children: nodes };
}

function tokenize(source) {
  const tokens = [];
  const text = String(source ?? '');
  let i = 0, line = 1, col = 1;
  const push = (type, value, startLine = line, startCol = col) => tokens.push({ type, value, line: startLine, col: startCol });
  const advance = () => {
    const ch = text[i++];
    if (ch === '\n') { line += 1; col = 1; } else col += 1;
    return ch;
  };
  while (i < text.length) {
    const ch = text[i];
    if (/\s/.test(ch)) { advance(); continue; }
    if (ch === '/' && text[i + 1] === '/') {
      while (i < text.length && advance() !== '\n') {}
      continue;
    }
    if (ch === '/' && text[i + 1] === '*') {
      advance(); advance();
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) advance();
      if (i >= text.length) throw new ScadError('Незакрытый комментарий.', { line, col });
      advance(); advance();
      continue;
    }
    const startLine = line, startCol = col;
    if (ch === '"' || ch === "'") {
      const quote = advance();
      let value = '';
      while (i < text.length && text[i] !== quote) {
        if (text[i] === '\\') {
          advance();
          const escaped = advance();
          value += ({ n: '\n', r: '\r', t: '\t' })[escaped] ?? escaped;
        } else value += advance();
      }
      if (text[i] !== quote) throw new ScadError('Незакрытая строка.', { line: startLine, col: startCol });
      advance(); push('string', value, startLine, startCol); continue;
    }
    if (/[0-9.]/.test(ch) && (/[0-9]/.test(ch) || /[0-9]/.test(text[i + 1] || ''))) {
      let raw = '';
      while (i < text.length && /[0-9eE+\-.]/.test(text[i])) {
        if ((text[i] === '+' || text[i] === '-') && raw && !/[eE]$/.test(raw)) break;
        raw += advance();
      }
      const value = Number(raw);
      if (!Number.isFinite(value)) throw new ScadError(`Некорректное число «${raw}».`, { line: startLine, col: startCol });
      push('number', value, startLine, startCol); continue;
    }
    if (/[A-Za-z_$]/.test(ch)) {
      let value = '';
      while (i < text.length && /[A-Za-z0-9_$]/.test(text[i])) value += advance();
      push('id', value, startLine, startCol); continue;
    }
    const two = text.slice(i, i + 2);
    if (['<=', '>=', '==', '!=', '&&', '||'].includes(two)) {
      advance(); advance(); push('symbol', two, startLine, startCol); continue;
    }
    if ('(){}[];,=:?+-*/%!<>'.includes(ch)) { advance(); push('symbol', ch, startLine, startCol); continue; }
    throw new ScadError(`Неподдерживаемый символ «${ch}».`, { line: startLine, col: startCol });
  }
  push('eof', '', line, col);
  return tokens;
}

class Parser {
  constructor(tokens) { this.tokens = tokens; this.i = 0; }
  peek(offset = 0) { return this.tokens[Math.min(this.i + offset, this.tokens.length - 1)]; }
  match(value) { if (this.peek().value === value) { this.i += 1; return true; } return false; }
  expect(value, message = `Ожидается «${value}».`) { const token = this.peek(); if (!this.match(value)) throw new ScadError(message, token); return token; }
  consume(type, message) { const token = this.peek(); if (token.type !== type) throw new ScadError(message || `Ожидается ${type}.`, token); this.i += 1; return token; }

  parseProgram() {
    const modules = new Map();
    const statements = [];
    while (this.peek().type !== 'eof') {
      if (this.peek().value === 'module') {
        const module = this.parseModule();
        if (modules.has(module.name)) throw new ScadError(`Модуль «${module.name}» объявлен повторно.`, module.token);
        modules.set(module.name, module);
      } else statements.push(this.parseStatement());
    }
    return { modules, statements };
  }

  parseModule() {
    const token = this.expect('module');
    const name = this.consume('id', 'После module требуется имя.').value;
    const params = this.parseParameters();
    const body = this.parseBlock();
    return { type: 'module', name, params, body, token };
  }

  parseParameters() {
    this.expect('(');
    const params = [];
    if (!this.match(')')) {
      do {
        const token = this.consume('id', 'Ожидается имя параметра.');
        const param = { name: token.value, defaultValue: null, token };
        if (this.match('=')) param.defaultValue = this.parseExpression();
        params.push(param);
      } while (this.match(','));
      this.expect(')');
    }
    return params;
  }

  parseBlock() {
    this.expect('{');
    const statements = [];
    while (!this.match('}')) {
      if (this.peek().type === 'eof') throw new ScadError('Незакрытый блок.', this.peek());
      statements.push(this.parseStatement());
    }
    return statements;
  }

  parseStatement() {
    const token = this.peek();
    if (token.value === ';') { this.i += 1; return { type: 'empty', token }; }
    if (token.value === 'for') return this.parseFor();
    if (token.value === 'if') return this.parseIf();
    if (token.type === 'id' && this.peek(1).value === '=') {
      this.i += 1; this.i += 1;
      const expr = this.parseExpression(); this.expect(';');
      return { type: 'assign', name: token.value, expr, token };
    }
    if (token.type === 'id') return this.parseCallStatement();
    throw new ScadError('Ожидается вызов модуля, присваивание, for или if.', token);
  }

  parseCallStatement() {
    const token = this.consume('id');
    const args = this.parseArguments();
    let children = [];
    if (this.peek().value === '{') children = this.parseBlock();
    else if (!this.match(';')) children = [this.parseStatement()];
    return { type: 'call', name: token.value, args, children, token };
  }

  parseFor() {
    const token = this.expect('for'); this.expect('(');
    const name = this.consume('id', 'В for требуется переменная.').value;
    this.expect('='); const expr = this.parseExpression(); this.expect(')');
    let body;
    if (this.peek().value === '{') body = this.parseBlock(); else body = [this.parseStatement()];
    return { type: 'for', name, expr, body, token };
  }

  parseIf() {
    const token = this.expect('if'); this.expect('('); const test = this.parseExpression(); this.expect(')');
    const yes = this.peek().value === '{' ? this.parseBlock() : [this.parseStatement()];
    let no = [];
    if (this.match('else')) no = this.peek().value === '{' ? this.parseBlock() : [this.parseStatement()];
    return { type: 'if', test, yes, no, token };
  }

  parseArguments() {
    this.expect('(');
    const args = [];
    if (!this.match(')')) {
      do {
        if (this.peek().type === 'id' && this.peek(1).value === '=') {
          const name = this.consume('id').value; this.expect('='); args.push({ name, expr: this.parseExpression() });
        } else args.push({ name: null, expr: this.parseExpression() });
      } while (this.match(','));
      this.expect(')');
    }
    return args;
  }

  parseExpression(min = 0) {
    let left = this.parseUnary();
    const prec = { '||': 1, '&&': 2, '==': 3, '!=': 3, '<': 4, '>': 4, '<=': 4, '>=': 4, '+': 5, '-': 5, '*': 6, '/': 6, '%': 6 };
    while (prec[this.peek().value] >= min) {
      const op = this.peek().value; const level = prec[op]; this.i += 1;
      const right = this.parseExpression(level + 1);
      left = { type: 'binary', op, left, right };
    }
    if (this.match('?')) {
      const yes = this.parseExpression(); this.expect(':'); const no = this.parseExpression();
      left = { type: 'conditional', test: left, yes, no };
    }
    return left;
  }

  parseUnary() {
    if (['+', '-', '!'].includes(this.peek().value)) {
      const op = this.peek().value; this.i += 1; return { type: 'unary', op, value: this.parseUnary() };
    }
    return this.parsePrimary();
  }

  parsePrimary() {
    const token = this.peek();
    if (token.type === 'number' || token.type === 'string') { this.i += 1; return { type: 'literal', value: token.value }; }
    if (token.type === 'id') {
      this.i += 1;
      if (this.peek().value === '(') return { type: 'function', name: token.value, args: this.parseArguments() };
      if (token.value === 'true') return { type: 'literal', value: true };
      if (token.value === 'false') return { type: 'literal', value: false };
      if (token.value === 'undef') return { type: 'literal', value: undefined };
      return { type: 'variable', name: token.value, token };
    }
    if (this.match('(')) { const value = this.parseExpression(); this.expect(')'); return value; }
    if (this.match('[')) {
      if (this.match(']')) return { type: 'array', items: [] };
      const first = this.parseExpression();
      if (this.match(':')) {
        const second = this.parseExpression();
        let step = null, end = second;
        if (this.match(':')) { step = second; end = this.parseExpression(); }
        this.expect(']'); return { type: 'range', start: first, step, end };
      }
      const items = [first];
      while (this.match(',')) items.push(this.parseExpression());
      this.expect(']'); return { type: 'array', items };
    }
    throw new ScadError('Некорректное выражение.', token);
  }
}

class Scope {
  constructor(parent = null) { this.parent = parent; this.values = new Map(); }
  set(name, value) { this.values.set(name, value); }
  get(name, token) {
    if (this.values.has(name)) return this.values.get(name);
    if (this.parent) return this.parent.get(name, token);
    throw new ScadError(`Неизвестная переменная «${name}».`, token);
  }
}

class Runtime {
  constructor(program) {
    this.program = program;
    this.global = new Scope();
    this.evidence = [];
    this.global.set('$fn', 48);
    this.global.set('PI', Math.PI);
  }

  evaluateTop() { return this.runStatements(this.program.statements, new Scope(this.global)); }

  evaluateModule(name, namedArgs = {}) {
    const module = this.program.modules.get(name);
    if (!module) throw new ScadError(`В OpenSCAD-коде нет module ${name}(...).`);
    const args = Object.entries(namedArgs).map(([key, value]) => ({ name: key, value }));
    return this.invokeUserModule(module, args, [], new Scope(this.global));
  }

  runStatements(statements, scope) {
    const nodes = [], shapes = [], evidence = [];
    for (const statement of statements) {
      const result = this.runStatement(statement, scope);
      nodes.push(...result.nodes); shapes.push(...result.shapes); evidence.push(...result.evidence);
    }
    return { nodes, shapes, evidence };
  }

  runStatement(statement, scope) {
    if (statement.type === 'empty') return emptyResult();
    if (statement.type === 'assign') { scope.set(statement.name, this.evalExpr(statement.expr, scope)); return emptyResult(); }
    if (statement.type === 'if') return this.runStatements(truthy(this.evalExpr(statement.test, scope)) ? statement.yes : statement.no, new Scope(scope));
    if (statement.type === 'for') {
      const values = this.evalExpr(statement.expr, scope);
      if (!Array.isArray(values)) throw new ScadError('for ожидает массив или диапазон.', statement.token);
      const aggregate = emptyResult();
      for (const value of values) {
        const inner = new Scope(scope); inner.set(statement.name, value);
        mergeResult(aggregate, this.runStatements(statement.body, inner));
      }
      return aggregate;
    }
    if (statement.type === 'call') return this.invoke(statement, scope);
    throw new ScadError(`Неподдерживаемый оператор ${statement.type}.`, statement.token);
  }

  invoke(statement, scope) {
    const args = statement.args.map(arg => ({ name: arg.name, value: this.evalExpr(arg.expr, scope) }));
    const childResult = this.runStatements(statement.children, new Scope(scope));
    const name = statement.name;
    const user = this.program.modules.get(name);
    if (user) return this.invokeUserModule(user, args, statement.children, scope);
    const result = this.invokeBuiltin(name, args, childResult, statement.token);
    this.evidence.push(...result.evidence);
    return result;
  }

  invokeUserModule(module, args, children, callerScope) {
    const scope = new Scope(callerScope);
    const positional = args.filter(arg => !arg.name);
    const named = new Map(args.filter(arg => arg.name).map(arg => [arg.name, arg.value]));
    module.params.forEach((param, index) => {
      let value;
      if (named.has(param.name)) value = named.get(param.name);
      else if (index < positional.length) value = positional[index].value;
      else if (param.defaultValue) value = this.evalExpr(param.defaultValue, callerScope);
      else value = undefined;
      scope.set(param.name, value);
    });
    if (children?.length) scope.set('$children', children);
    return this.runStatements(module.body, scope);
  }

  invokeBuiltin(name, args, child, token) {
    const named = Object.fromEntries(args.filter(a => a.name).map(a => [a.name, a.value]));
    const pos = args.filter(a => !a.name).map(a => a.value);
    const arg = (key, index, fallback) => named[key] !== undefined ? named[key] : pos[index] !== undefined ? pos[index] : fallback;
    const children3d = child.nodes;
    const children2d = child.shapes;
    const evidence = [];

    if (name === 'cube') {
      const raw = arg('size', 0, 1); const size = vec(raw, 3, 1); const center = Boolean(arg('center', 1, false));
      return nodeResult(center ? { type: 'box', size } : { type: 'box', size, position: size.map(v => v / 2) });
    }
    if (name === 'sphere') {
      const radius = Number(named.r ?? (named.d !== undefined ? named.d / 2 : pos[0] ?? 1));
      return nodeResult({ type: 'sphere', radius: positive(radius, 'sphere radius', token) });
    }
    if (name === 'cylinder') {
      const height = positive(Number(arg('h', 0, 1)), 'cylinder h', token);
      const r1 = Number(named.r1 ?? named.r ?? (named.d1 !== undefined ? named.d1 / 2 : named.d !== undefined ? named.d / 2 : pos[1] ?? 1));
      const r2 = Number(named.r2 ?? named.r ?? (named.d2 !== undefined ? named.d2 / 2 : named.d !== undefined ? named.d / 2 : pos[2] ?? r1));
      const center = Boolean(named.center ?? false);
      let node;
      if (Math.abs(r1 - r2) < 1e-8) node = { type: 'cylinder', radius: positive(r1, 'cylinder radius', token), height };
      else node = { type: 'lathe', profile: [[0, -height / 2], [r1, -height / 2], [r2, height / 2], [0, height / 2]] };
      if (!center) node.position = [0, 0, height / 2];
      return nodeResult(node);
    }
    if (name === 'polygon') {
      const points = arg('points', 0, null);
      if (!Array.isArray(points) || points.length < 3) throw new ScadError('polygon(points=...) требует минимум три точки.', token);
      return shapeResult({ kind: 'polygon', points: points.map(p => vec(p, 2, 0)) });
    }
    if (['translate', 'rotate', 'scale', 'mirror', 'color'].includes(name)) {
      if (!children3d.length && !children2d.length) throw new ScadError(`${name} требует дочернюю геометрию.`, token);
      if (name === 'color') return child;
      const raw = arg(name === 'mirror' ? 'v' : undefined, 0, name === 'scale' ? [1, 1, 1] : [0, 0, 0]);
      const value = vec(raw, 3, name === 'scale' ? 1 : 0);
      if (children2d.length) {
        if (name !== 'translate' && name !== 'scale') throw new ScadError(`${name} для 2D пока не поддерживается.`, token);
        const shapes = children2d.map(shape => transformShape(shape, name, value));
        return { nodes: [], shapes, evidence: child.evidence };
      }
      const node = combine('union', children3d);
      if (name === 'translate') node.position = addVec(node.position, value);
      if (name === 'rotate') node.rotation = addVec(node.rotation, value);
      if (name === 'scale') node.scale = mulVec(node.scale, value);
      const transformedEvidence = transformEvidence(child.evidence, name, value);
      if (name === 'mirror') return nodeResult({ type: 'mirror', axis: dominantAxis(value), child: node }, transformedEvidence);
      return nodeResult(node, transformedEvidence);
    }
    if (name === 'union') return nodeResult(combine('union', children3d), child.evidence);
    if (name === 'difference') {
      if (children3d.length < 2) throw new ScadError('difference() требует основное тело и минимум один вычитаемый объект.', token);
      return nodeResult({ type: 'subtract', children: children3d }, child.evidence);
    }
    if (name === 'intersection') {
      if (children3d.length < 2) throw new ScadError('intersection() требует минимум два объекта.', token);
      return nodeResult({ type: 'intersect', children: children3d }, child.evidence);
    }
    if (name === 'linear_extrude') {
      const height = positive(Number(arg('height', 0, 1)), 'linear_extrude height', token);
      const center = Boolean(named.center ?? false);
      if (children2d.length !== 1) throw new ScadError('linear_extrude требует ровно один polygon().', token);
      const shape = children2d[0];
      let node = { type: 'extrudePolygon', points: shape.points, height };
      if (!center) node.position = [0, 0, height / 2];
      return nodeResult(node, child.evidence);
    }
    if (name === 'rotate_extrude') {
      if (children2d.length !== 1) throw new ScadError('rotate_extrude требует ровно один polygon() профиля.', token);
      return nodeResult({ type: 'lathe', profile: children2d[0].points }, child.evidence);
    }
    if (name === 'children') {
      throw new ScadError('children() пока не поддерживается. Передавайте геометрию через обычный модуль.', token);
    }
    if (name === 'forma_spur_gear') {
      const teeth = integer(arg('teeth', 0, 20), 6, 240, 'teeth', token);
      const moduleValue = positive(Number(arg('module', 1, 1)), 'module', token);
      const thickness = positive(Number(arg('thickness', 2, 5)), 'thickness', token);
      const bore = Math.max(0, Number(arg('bore', 3, 0)));
      const backlash = Math.max(0, Number(named.backlash ?? 0.18));
      const pressure = Number(named.pressure_angle ?? 20);
      const gear = spurGearNode({ teeth, module: moduleValue, thickness, bore, backlash });
      evidence.push({ type: 'certified-gear', teeth, module: moduleValue, thickness, bore, pressureAngle: pressure, center: [0,0,0], axis: 'z' });
      return nodeResult(gear, evidence);
    }
    if (name === 'forma_ring_gear') {
      const teeth = integer(arg('teeth', 0, 48), 18, 240, 'teeth', token);
      const moduleValue = positive(Number(arg('module', 1, 1)), 'module', token);
      const thickness = positive(Number(arg('thickness', 2, 5)), 'thickness', token);
      const wall = positive(Number(arg('wall', 3, 2.4)), 'wall', token);
      const backlash = Math.max(0, Number(named.backlash ?? 0.18));
      const gear = ringGearNode({ teeth, module: moduleValue, thickness, wall, backlash });
      evidence.push({ type: 'certified-ring-gear', teeth, module: moduleValue, thickness, wall, center: [0,0,0], axis: 'z' });
      return nodeResult(gear, evidence);
    }
    if (name === 'forma_planet_carrier') {
      const orbit = positive(Number(arg('orbit', 0, 15)), 'orbit', token);
      const count = integer(arg('count', 1, 1), 1, 8, 'count', token);
      const plateThickness = positive(Number(arg('plate_thickness', 2, 3)), 'plate_thickness', token);
      const pinDiameter = positive(Number(arg('pin_diameter', 3, 3)), 'pin_diameter', token);
      const pinHeight = positive(Number(arg('pin_height', 4, 5)), 'pin_height', token);
      const bore = Math.max(0, Number(arg('bore', 5, 0)));
      const plateRadius = positive(Number(named.plate_radius ?? orbit + pinDiameter * 1.7), 'plate_radius', token);
      const plate = { type: 'cylinder', radius: plateRadius, height: plateThickness, position: [0,0,plateThickness/2] };
      const pin = { type: 'cylinder', radius: pinDiameter / 2, height: pinHeight, position: [orbit,0,plateThickness + pinHeight/2] };
      let carrier = { type: 'union', children: [plate, { type: 'radialArray', count, axis: 'z', child: pin }] };
      if (bore > 0) carrier = { type: 'subtract', children: [carrier, { type: 'cylinder', radius: bore/2, height: plateThickness + pinHeight + 1, position:[0,0,(plateThickness+pinHeight)/2] }] };
      evidence.push({ type: 'certified-planet-carrier', orbit, count, pinDiameter, pinHeight, center:[0,0,0], axis:'z' });
      return nodeResult(carrier, evidence);
    }
    if (name === 'forma_planetary_layout') {
      throw new ScadError('forma_planetary_layout — не геометрия. Используйте сертифицированные gear/ring/carrier модули и контракт planetary.', token);
    }
    if (['hull', 'minkowski', 'surface', 'import', 'text', 'projection', 'offset', 'resize', 'polyhedron'].includes(name)) {
      throw new ScadError(`${name}() ещё не входит в безопасный OpenSCAD-профиль FORMA 2.0.`, token);
    }
    throw new ScadError(`Неизвестный модуль «${name}». Добавьте его определение module ${name}(...) или используйте поддерживаемую команду.`, token);
  }

  evalExpr(expr, scope) {
    if (expr.type === 'literal') return expr.value;
    if (expr.type === 'variable') return scope.get(expr.name, expr.token);
    if (expr.type === 'array') return expr.items.map(item => this.evalExpr(item, scope));
    if (expr.type === 'range') {
      const start = Number(this.evalExpr(expr.start, scope));
      const end = Number(this.evalExpr(expr.end, scope));
      const step = expr.step ? Number(this.evalExpr(expr.step, scope)) : (end >= start ? 1 : -1);
      if (!Number.isFinite(start + end + step) || step === 0) throw new ScadError('Некорректный диапазон.');
      const out = [];
      for (let value = start, count = 0; step > 0 ? value <= end + 1e-9 : value >= end - 1e-9; value += step) {
        if (count++ > 2000) throw new ScadError('Диапазон слишком большой (максимум 2000 значений).');
        out.push(value);
      }
      return out;
    }
    if (expr.type === 'unary') {
      const value = this.evalExpr(expr.value, scope);
      return expr.op === '-' ? -Number(value) : expr.op === '+' ? Number(value) : !truthy(value);
    }
    if (expr.type === 'binary') {
      const a = this.evalExpr(expr.left, scope), b = this.evalExpr(expr.right, scope);
      return ({
        '+': () => Number(a) + Number(b), '-': () => Number(a) - Number(b), '*': () => Number(a) * Number(b), '/': () => Number(a) / Number(b), '%': () => Number(a) % Number(b),
        '<': () => a < b, '>': () => a > b, '<=': () => a <= b, '>=': () => a >= b, '==': () => a === b, '!=': () => a !== b,
        '&&': () => truthy(a) && truthy(b), '||': () => truthy(a) || truthy(b)
      })[expr.op]();
    }
    if (expr.type === 'conditional') return this.evalExpr(truthy(this.evalExpr(expr.test, scope)) ? expr.yes : expr.no, scope);
    if (expr.type === 'function') {
      const args = expr.args.map(arg => this.evalExpr(arg.expr, scope));
      const fn = {
        sin: x => Math.sin(Number(x) * DEG), cos: x => Math.cos(Number(x) * DEG), tan: x => Math.tan(Number(x) * DEG),
        asin: x => Math.asin(Number(x)) / DEG, acos: x => Math.acos(Number(x)) / DEG, atan: x => Math.atan(Number(x)) / DEG,
        abs: Math.abs, sqrt: Math.sqrt, pow: Math.pow, min: Math.min, max: Math.max, floor: Math.floor, ceil: Math.ceil, round: Math.round,
        len: x => x?.length ?? 0
      }[expr.name];
      if (!fn) throw new ScadError(`Функция «${expr.name}» не поддерживается в выражениях.`);
      return fn(...args);
    }
    throw new ScadError(`Неизвестное выражение ${expr.type}.`);
  }
}

function spurGearNode({ teeth, module, thickness, bore, backlash }) {
  const pitchRadius = teeth * module / 2;
  const rootRadius = Math.max(module * 1.2, pitchRadius - 1.25 * module);
  const outerRadius = pitchRadius + module;
  const circularPitch = Math.PI * module;
  const toothWidth = Math.max(module * 0.55, circularPitch / 2 - backlash);
  const toothDepth = outerRadius - rootRadius;
  const tooth = {
    type: 'roundedBox',
    size: [toothDepth * 1.35, toothWidth, thickness],
    radius: Math.min(module * 0.16, toothWidth * 0.22),
    position: [rootRadius + toothDepth * 0.5, 0, 0]
  };
  let body = { type: 'union', children: [
    { type: 'cylinder', radius: rootRadius, height: thickness },
    { type: 'radialArray', count: teeth, axis: 'z', child: tooth }
  ] };
  if (bore > 0) body = { type: 'subtract', children: [body, { type: 'cylinder', radius: bore / 2, height: thickness + 1.2 }] };
  return body;
}

function ringGearNode({ teeth, module, thickness, wall, backlash }) {
  const pitchRadius = teeth * module / 2;
  const innerTip = Math.max(module * 2, pitchRadius - module);
  const root = pitchRadius + 1.25 * module;
  const outer = root + wall;
  const circularPitch = Math.PI * module;
  const gapWidth = Math.max(module * 0.55, circularPitch / 2 + backlash);
  const gapDepth = root - innerTip + module * 0.25;
  const gap = {
    type: 'box', size: [gapDepth * 1.5, gapWidth, thickness + 1.2],
    position: [innerTip + gapDepth * 0.48, 0, 0]
  };
  return { type: 'subtract', children: [
    { type: 'cylinder', radius: outer, height: thickness },
    { type: 'cylinder', radius: innerTip, height: thickness + 1.2 },
    { type: 'radialArray', count: teeth, axis: 'z', child: gap }
  ] };
}

function transformShape(shape, kind, value) {
  if (shape.kind !== 'polygon') return shape;
  const points = shape.points.map(([x, y]) => kind === 'translate' ? [x + value[0], y + value[1]] : [x * value[0], y * value[1]]);
  return { ...shape, points };
}

function transformEvidence(items, kind, value) {
  return (items || []).map(item => {
    const next = { ...item, center: Array.isArray(item.center) ? [...item.center] : [0,0,0] };
    if (kind === 'translate') next.center = addVec(next.center, value);
    else if (kind === 'scale') next.center = next.center.map((v,i)=>v*value[i]);
    else if (kind === 'rotate') {
      next.center = rotateVector(next.center, value);
      if (next.axis) next.axis = rotateAxis(next.axis, value);
    } else if (kind === 'mirror') {
      const axis = dominantAxis(value); const idx = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
      next.center[idx] *= -1;
    }
    return next;
  });
}
function rotateVector(point, degrees) {
  let [x,y,z] = point.map(Number);
  const [rx,ry,rz] = degrees.map(v=>Number(v)*DEG);
  let c=Math.cos(rx),s=Math.sin(rx); [y,z]=[y*c-z*s,y*s+z*c];
  c=Math.cos(ry);s=Math.sin(ry); [x,z]=[x*c+z*s,-x*s+z*c];
  c=Math.cos(rz);s=Math.sin(rz); [x,y]=[x*c-y*s,x*s+y*c];
  return [x,y,z];
}
function rotateAxis(axis, degrees) {
  const vector = axis === 'x' ? [1,0,0] : axis === 'y' ? [0,1,0] : [0,0,1];
  const rotated = rotateVector(vector, degrees).map(Math.abs);
  return ['x','y','z'][rotated.indexOf(Math.max(...rotated))];
}

function dominantAxis(value) {
  const abs = value.map(Math.abs); const max = Math.max(...abs); const index = abs.indexOf(max);
  return ['x', 'y', 'z'][index];
}
function addVec(a, b) { const base = Array.isArray(a) ? a : [0, 0, 0]; return base.map((v, i) => Number(v) + Number(b[i])); }
function mulVec(a, b) { const base = Array.isArray(a) ? a : [1, 1, 1]; return base.map((v, i) => Number(v) * Number(b[i])); }
function vec(value, length, fallback) { const array = Array.isArray(value) ? value : Array(length).fill(value ?? fallback); return Array.from({ length }, (_, i) => Number(array[i] ?? fallback)); }
function positive(value, label, token) { if (!Number.isFinite(value) || value <= 0) throw new ScadError(`${label} должен быть положительным.`, token); return value; }
function integer(value, min, max, label, token) { const n = Math.round(Number(value)); if (!Number.isFinite(n) || n < min || n > max) throw new ScadError(`${label} должен быть целым от ${min} до ${max}.`, token); return n; }
function truthy(value) { return Boolean(value); }
function emptyResult() { return { nodes: [], shapes: [], evidence: [] }; }
function nodeResult(node, evidence = []) { return { nodes: [node], shapes: [], evidence }; }
function shapeResult(shape, evidence = []) { return { nodes: [], shapes: [shape], evidence }; }
function mergeResult(target, source) { target.nodes.push(...source.nodes); target.shapes.push(...source.shapes); target.evidence.push(...source.evidence); return target; }
