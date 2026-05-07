const BIGINT_MIN_TEXT = '-9223372036854775808';
const BIGINT_MAX_TEXT = '9223372036854775807';
const BIGINT_NEGATIVE_LIMIT_TEXT = '9223372036854775808';
const NUMERIC_DATA_TYPES = new Set(['smallint', 'integer', 'bigint', 'numeric', 'decimal', 'real', 'double precision']);
const TEXT_DATA_TYPES = new Set(['text', 'character varying', 'character']);

type SchemaMigrationQueryable = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>>; rowCount?: number | null }>;
};

export async function ensureBigintColumnType(
  client: SchemaMigrationQueryable,
  tableName: string,
  columnName: string,
): Promise<void> {
  await ensureNumericColumnType(client, tableName, columnName, 'bigint');
}

export async function ensureDoubleColumnType(
  client: SchemaMigrationQueryable,
  tableName: string,
  columnName: string,
): Promise<void> {
  await ensureNumericColumnType(client, tableName, columnName, 'double precision');
}

async function ensureNumericColumnType(
  client: SchemaMigrationQueryable,
  tableName: string,
  columnName: string,
  targetType: 'bigint' | 'double precision',
): Promise<void> {
  const tableIdentifier = quoteIdentifier(tableName);
  const columnIdentifier = quoteIdentifier(columnName);
  const metadata = await client.query(
    `
      SELECT data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = $1
        AND column_name = $2
      LIMIT 1
    `,
    [tableName, columnName],
  );
  if ((metadata.rowCount ?? 0) === 0) {
    return;
  }

  const row = metadata.rows[0] ?? {};
  const dataType = normalizeMetadataString(row.data_type);
  if (dataType === targetType) {
    return;
  }

  const isNullable = normalizeMetadataString(row.is_nullable).toUpperCase() === 'YES';
  const columnDefault = normalizeOptionalMetadataString(row.column_default);
  const usingExpression = targetType === 'bigint'
    ? buildBigintUsingExpression(columnIdentifier, dataType, isNullable)
    : buildDoubleUsingExpression(columnIdentifier, dataType, isNullable);

  if (columnDefault) {
    await client.query(`
      ALTER TABLE ${tableIdentifier}
      ALTER COLUMN ${columnIdentifier} DROP DEFAULT
    `);
  }

  await client.query(`
    ALTER TABLE ${tableIdentifier}
    ALTER COLUMN ${columnIdentifier} TYPE ${targetType} USING (${usingExpression})
  `);

  if (columnDefault) {
    await client.query(`
      ALTER TABLE ${tableIdentifier}
      ALTER COLUMN ${columnIdentifier} SET DEFAULT (${columnDefault})::${targetType}
    `);
  }
}

export async function ensureBigintColumnsWithClient(
  client: SchemaMigrationQueryable,
  columnsByTable: Record<string, readonly string[]>,
): Promise<void> {
  for (const [tableName, columns] of Object.entries(columnsByTable)) {
    for (const column of columns) {
      await ensureBigintColumnType(client, tableName, column);
    }
  }
}

export async function ensureDoubleColumnsWithClient(
  client: SchemaMigrationQueryable,
  columnsByTable: Record<string, readonly string[]>,
): Promise<void> {
  for (const [tableName, columns] of Object.entries(columnsByTable)) {
    for (const column of columns) {
      await ensureDoubleColumnType(client, tableName, column);
    }
  }
}

function buildBigintUsingExpression(columnIdentifier: string, dataType: string, isNullable: boolean): string {
  return NUMERIC_DATA_TYPES.has(dataType)
    ? buildBigintNumericUsingExpression(columnIdentifier)
    : TEXT_DATA_TYPES.has(dataType)
      ? buildBigintTextUsingExpression(columnIdentifier, isNullable)
      : buildBigintTextUsingExpression(`${columnIdentifier}::text`, isNullable);
}

function buildBigintNumericUsingExpression(columnIdentifier: string): string {
  return `
    CASE
      WHEN ${columnIdentifier} IS NULL THEN NULL
      WHEN ${columnIdentifier} < '${BIGINT_MIN_TEXT}'::numeric THEN '${BIGINT_MIN_TEXT}'::bigint
      WHEN ${columnIdentifier} > '${BIGINT_MAX_TEXT}'::numeric THEN '${BIGINT_MAX_TEXT}'::bigint
      ELSE ${columnIdentifier}::bigint
    END
  `;
}

function buildBigintTextUsingExpression(valueExpression: string, isNullable: boolean): string {
  const fallback = isNullable ? 'NULL' : '0::bigint';
  const digitsExpression = `COALESCE(NULLIF(regexp_replace(regexp_replace(${valueExpression}, '^-', ''), '^0+', ''), ''), '0')`;
  const digitLengthExpression = `length(${digitsExpression})`;
  return `
    CASE
      WHEN ${valueExpression} IS NULL THEN NULL
      WHEN ${valueExpression} ~ '^-?[0-9]+$' THEN
        CASE
          WHEN ${digitLengthExpression} > 19 THEN
            CASE WHEN ${valueExpression} ~ '^-' THEN '${BIGINT_MIN_TEXT}'::bigint ELSE '${BIGINT_MAX_TEXT}'::bigint END
          WHEN ${valueExpression} !~ '^-' AND ${digitLengthExpression} = 19 AND ${digitsExpression} > '${BIGINT_MAX_TEXT}' THEN '${BIGINT_MAX_TEXT}'::bigint
          WHEN ${valueExpression} ~ '^-' AND ${digitLengthExpression} = 19 AND ${digitsExpression} > '${BIGINT_NEGATIVE_LIMIT_TEXT}' THEN '${BIGINT_MIN_TEXT}'::bigint
          ELSE ${valueExpression}::numeric::bigint
        END
      ELSE ${fallback}
    END
  `;
}

function buildDoubleUsingExpression(columnIdentifier: string, dataType: string, isNullable: boolean): string {
  if (NUMERIC_DATA_TYPES.has(dataType)) {
    return `${columnIdentifier}::double precision`;
  }
  const valueExpression = TEXT_DATA_TYPES.has(dataType) ? columnIdentifier : `${columnIdentifier}::text`;
  const fallback = isNullable ? 'NULL' : '0::double precision';
  return `
    CASE
      WHEN ${valueExpression} IS NULL THEN NULL
      WHEN ${valueExpression} ~ '^-?([0-9]+(\\.[0-9]*)?|\\.[0-9]+)([eE][+-]?[0-9]+)?$' THEN ${valueExpression}::double precision
      ELSE ${fallback}
    END
  `;
}

function normalizeMetadataString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeOptionalMetadataString(value: unknown): string | null {
  const normalized = normalizeMetadataString(value);
  return normalized ? normalized : null;
}

function quoteIdentifier(identifier: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(identifier)) {
    throw new Error(`unsafe SQL identifier: ${identifier}`);
  }
  return `"${identifier}"`;
}
