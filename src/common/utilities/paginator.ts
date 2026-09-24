export interface PaginationResult<T = any> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

interface PaginateOptions {
  limit?: number;
  offset?: number;
  sortBy?: string;
  order?: 'ASC' | 'DESC';
}

interface RangeFilter {
  gte?: string | number;
  lte?: string | number;
}

interface PaginateParams {
  dbClient: {
    query: (sql: string, params?: any[]) => Promise<{ rows: any[] }>;
  };
  table: string;
  selectColumns: string[];
  pkFields: string[];
  where?: Record<string, any | RangeFilter>;
  options?: PaginateOptions;
}

const isRangeFilter = (value: unknown): value is RangeFilter =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  ('gte' in value || 'lte' in value);

const VALID_ORDER = new Set(['ASC', 'DESC']);
const IDENTIFIER_RE = /^[a-zA-Z_][a-zA-Z0-9_.]*$/;

export async function paginate<T = any>({
  dbClient,
  table,
  selectColumns,
  where,
  options = {},
}: PaginateParams): Promise<PaginationResult<T>> {
  const {
    limit = 10,
    offset = 0,
    sortBy = 'created_at',
    order = 'DESC',
  } = options;

  if (!IDENTIFIER_RE.test(sortBy)) {
    throw new Error(`Invalid sortBy value: ${sortBy}`);
  }

  const safeOrder = VALID_ORDER.has(order.toUpperCase())
    ? order.toUpperCase()
    : 'DESC';

  const params: any[] = [];
  const conditions: string[] = [];

  if (where) {
    for (const [key, value] of Object.entries(where)) {
      if (isRangeFilter(value)) {
        if (value.gte !== undefined) {
          params.push(value.gte);
          conditions.push(`${key} >= $${params.length}`);
        }
        if (value.lte !== undefined) {
          params.push(value.lte);
          conditions.push(`${key} <= $${params.length}`);
        }
        continue;
      }
      params.push(value);
      conditions.push(`${key} = $${params.length}`);
    }
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countSql = `SELECT COUNT(*) FROM ${table} ${whereClause}`;
  const { rows: countRows } = await dbClient.query(countSql, params);
  const total = parseInt(countRows[0].count, 10);

  params.push(limit);
  params.push(offset);

  const columns = selectColumns.join(', ');
  const sql = `
    SELECT ${columns}
    FROM ${table}
    ${whereClause}
    ORDER BY ${sortBy} ${safeOrder}
    LIMIT $${params.length - 1} OFFSET $${params.length}
  `;

  const { rows } = await dbClient.query(sql, params);

  return {
    data: rows as T[],
    total,
    limit,
    offset,
    hasMore: offset + rows.length < total,
  };
}
