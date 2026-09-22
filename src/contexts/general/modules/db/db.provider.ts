import Database, { DatabaseConfig } from '@crane-technologies/database';
import { types as pgTypes } from 'pg';
import { queries } from '@/queries';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'fs';
import { join } from 'path';

export const DATABASE = 'DATABASE';

/**
 * OID 1082 = DATE. Por defecto node-postgres convierte una columna DATE
 * en un objeto Date de JS a medianoche LOCAL del proceso; al serializar
 * la respuesta a JSON (toISOString) el valor se corre hacia atras tantas
 * horas como tenga de offset la zona del servidor, y una fecha sin hora
 * termina mostrandose un dia antes en el cliente.
 *
 * Una fecha de calendario (ingreso, egreso, vigencia, feriado) no tiene
 * zona horaria: se devuelve tal cual la guarda Postgres, 'YYYY-MM-DD'.
 * Los TIMESTAMP (OID 1114/1184) si conservan su parseo normal.
 */
pgTypes.setTypeParser(pgTypes.builtins.DATE, (value: string) => value);

let db: Database | null = null;

function stripLeadingComments(s: string): string {
  let r = s.trimStart();
  while (r.startsWith('--') || r.startsWith('/*')) {
    if (r.startsWith('--')) {
      const nl = r.indexOf('\n');
      r = nl === -1 ? '' : r.slice(nl + 1).trimStart();
    } else {
      const end = r.indexOf('*/');
      r = end === -1 ? '' : r.slice(end + 2).trimStart();
    }
  }
  return r;
}

function pushStatement(buf: string, out: string[]): void {
  const stmt = buf.trim();
  if (!stmt) return;
  const stripped = stripLeadingComments(stmt).toUpperCase();
  if (!stripped || stripped === 'BEGIN' || stripped === 'COMMIT') return;
  out.push(stmt);
}

function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let inDollarQuote = false;
  let dollarTag = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inLineComment = false;
  let inBlockComment = false;
  let i = 0;

  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (inLineComment) {
      current += ch;
      if (ch === '\n') inLineComment = false;
      i++;
      continue;
    }

    if (inBlockComment) {
      current += ch;
      if (ch === '*' && next === '/') {
        current += next;
        inBlockComment = false;
        i += 2;
        continue;
      }
      i++;
      continue;
    }

    if (inSingleQuote) {
      current += ch;
      if (ch === "'") {
        if (next === "'") {
          current += next;
          i += 2;
          continue;
        }
        inSingleQuote = false;
      }
      i++;
      continue;
    }

    if (inDoubleQuote) {
      current += ch;
      if (ch === '"') {
        if (next === '"') {
          current += next;
          i += 2;
          continue;
        }
        inDoubleQuote = false;
      }
      i++;
      continue;
    }

    if (inDollarQuote) {
      const closeMatch =
        ch === '$' ? sql.slice(i).match(/^\$([A-Za-z_]*)\$/) : null;
      if (closeMatch && closeMatch[0] === dollarTag) {
        current += closeMatch[0];
        i += closeMatch[0].length;
        inDollarQuote = false;
        dollarTag = '';
        continue;
      }
      current += ch;
      i++;
      continue;
    }

    if (ch === '-' && next === '-') {
      inLineComment = true;
      current += ch;
      i++;
      continue;
    }

    if (ch === '/' && next === '*') {
      inBlockComment = true;
      current += ch;
      current += next;
      i += 2;
      continue;
    }

    if (ch === "'") {
      inSingleQuote = true;
      current += ch;
      i++;
      continue;
    }

    if (ch === '"') {
      inDoubleQuote = true;
      current += ch;
      i++;
      continue;
    }

    if (ch === '$') {
      const openMatch = sql.slice(i).match(/^\$([A-Za-z_]*)\$/);
      if (openMatch) {
        inDollarQuote = true;
        dollarTag = openMatch[0];
        current += openMatch[0];
        i += openMatch[0].length;
        continue;
      }
    }

    if (ch === ';') {
      pushStatement(current, statements);
      current = '';
      i++;
      continue;
    }

    current += ch;
    i++;
  }

  pushStatement(current, statements);
  return statements;
}

async function bootstrapIfNeeded(database: Database): Promise<void> {
  const result = await database.rawQuery<{ exists: boolean }>(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'general_schema' AND table_name = 'role'
    ) AS exists
  `);

  if (result.rows[0]?.exists) {
    return;
  }

  const sql = readFileSync(join(__dirname, 'database_backup.sql'), 'utf8');
  const statements = splitSqlStatements(sql);

  const txn = await database.transaction();
  try {
    for (const stmt of statements) {
      await txn.rawQuery(stmt);
    }
    await txn.commit();
  } catch (err) {
    await txn.rollback();
    throw new Error(
      `Bootstrap failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export const dbProvider = {
  provide: DATABASE,
  useFactory: async (configService: ConfigService) => {
    const isLocal = configService.get<string>('NODE_ENV') !== 'production';
    const config: DatabaseConfig = {
      connectionString: configService.get<string>('DB_CONNECTION'),
      max: Number(configService.get<number>('MAX_POOL_SIZE')) || 10,
      ssl: isLocal ? false : { rejectUnauthorized: false },
    };

    db = Database.getInstance(config, queries);

    await bootstrapIfNeeded(db);

    return db;
  },
  inject: [ConfigService],
};
