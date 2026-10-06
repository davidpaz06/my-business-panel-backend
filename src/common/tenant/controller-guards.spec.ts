import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, sep } from 'path';

/**
 * Candado contra regresiones de aislamiento: TODA ruta HTTP debe quedar detras
 * de AuthenticationGuard (a nivel de clase o de metodo), salvo las de esta
 * lista de rutas publicas a proposito.
 *
 * El candado es por ruta y no por archivo: un controller con un solo metodo
 * protegido ya no lo deja pasar entero.
 *
 * Una ruta publica nueva tiene que declararse aqui de forma explicita (y
 * justificarse en la revision); una ruta que deja de ser publica hace fallar
 * el test hasta que se saque de la lista.
 */
const PUBLIC_BY_DESIGN: Record<string, string> = {
  'GET /': 'health check',
  'POST /auth/login': 'inicio de sesion',
  'POST /auth/refresh': 'se autentica con RefreshTokenGuard (cookie de refresh)',
  'GET /region': 'catalogo de regiones del formulario de registro',
  'GET /tenant/availability': 'sonda del onboarding (usuario sin cuenta)',
  'POST /tenant':
    'alta de onboarding; exige user + subscription en el cuerpo (ver controller)',
  'POST /subscription/webhook': 'webhook de Stripe, autenticado por firma',
  'GET /special-code/validate': 'valida un codigo antes del registro',
};

const SRC = join(__dirname, '..', '..');
const HTTP_METHODS = ['Get', 'Post', 'Put', 'Patch', 'Delete'];

function controllerFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return controllerFiles(full);
    return name.endsWith('.controller.ts') ? [full] : [];
  });
}

/** Junta decoradores (incluso multilinea) balanceando parentesis. */
function decoratorsOf(lines: string[], from: number) {
  const decorators: string[] = [];
  let i = from;
  for (; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith('@')) break;
    let text = line;
    let depth = count(line, '(') - count(line, ')');
    while (depth > 0 && i + 1 < lines.length) {
      i++;
      text += ' ' + lines[i].trim();
      depth += count(lines[i], '(') - count(lines[i], ')');
    }
    decorators.push(text);
  }
  return { decorators, next: i };
}

function count(s: string, ch: string) {
  return s.split(ch).length - 1;
}

interface RouteInfo {
  file: string;
  route: string;
  guarded: boolean;
}

function routesOf(file: string, source: string): RouteInfo[] {
  const lines = source
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.replace(/^\s*\/\/.*$/, ''));
  const classIdx = lines.findIndex((l) => /^export class/.test(l));
  const head = lines.slice(0, classIdx).join('\n');
  const prefix = (head.match(/@Controller\(\s*'([^']*)'/) ?? [, ''])[1] ?? '';
  const classGuarded = /@UseGuards\([^)]*AuthenticationGuard/.test(head);

  const routes: RouteInfo[] = [];
  for (let i = classIdx + 1; i < lines.length; i++) {
    if (!lines[i].trim().startsWith('@')) continue;
    const { decorators, next } = decoratorsOf(lines, i);
    i = next;
    const route = decorators.find((d) =>
      new RegExp(`^@(${HTTP_METHODS.join('|')})\\(`).test(d),
    );
    if (!route) continue;
    const [, method, path = ''] = route.match(/^@(\w+)\(\s*'?([^')]*)'?/) ?? [];
    const url = `/${prefix}/${path}`.replace(/\/+/g, '/').replace(/(.)\/$/, '$1');
    routes.push({
      file,
      route: `${method.toUpperCase()} ${url}`,
      guarded:
        classGuarded ||
        decorators.some((d) => /@UseGuards\([^)]*AuthenticationGuard/.test(d)),
    });
  }
  return routes;
}

describe('controllers: AuthenticationGuard obligatorio por ruta', () => {
  const files = controllerFiles(SRC).map((f) => ({
    path: relative(SRC, f).split(sep).join('/'),
    source: readFileSync(f, 'utf8'),
  }));
  const routes = files.flatMap((f) => routesOf(f.path, f.source));

  it('encuentra controllers y rutas', () => {
    expect(files.length).toBeGreaterThan(30);
    expect(routes.length).toBeGreaterThan(200);
  });

  it('el analizador ve todas las rutas (no se pierde ninguna decorada)', () => {
    const declared = files.reduce(
      (n, f) =>
        n +
        (f.source.match(
          new RegExp(`^\\s*@(${HTTP_METHODS.join('|')})\\(`, 'gm'),
        )?.length ?? 0),
      0,
    );
    expect(routes.length).toBe(declared);
  });

  it('ninguna ruta queda sin AuthenticationGuard salvo las publicas a proposito', () => {
    const unguarded = routes
      .filter((r) => !r.guarded)
      .filter((r) => !(r.route in PUBLIC_BY_DESIGN))
      .map((r) => `${r.route}  (${r.file})`);
    expect(unguarded).toEqual([]);
  });

  it('la lista de rutas publicas no tiene entradas obsoletas', () => {
    const publicRoutes = new Set(
      routes.filter((r) => !r.guarded).map((r) => r.route),
    );
    const stale = Object.keys(PUBLIC_BY_DESIGN).filter(
      (r) => !publicRoutes.has(r),
    );
    expect(stale).toEqual([]);
  });
});
