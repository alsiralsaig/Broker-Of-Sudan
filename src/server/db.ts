// طبقة قاعدة البيانات — Neon في الإنتاج، و PGlite (Postgres داخل الذاكرة) للتطوير والاختبارات.
import { neon } from '@neondatabase/serverless';

export interface Stmt {
  text: string;
  params?: unknown[];
}

export interface Db {
  /** استعلام واحد يرجّع الصفوف */
  query<T = any>(text: string, params?: unknown[]): Promise<T[]>;
  /** عدة استعلامات داخل معاملة واحدة (كلها تنجح أو كلها تُلغى) */
  tx(stmts: Stmt[]): Promise<any[][]>;
}

export function createNeonDb(url: string): Db {
  const sql = neon(url);
  return {
    async query(text, params = []) {
      return (await sql.query(text, params as any[])) as any[];
    },
    async tx(stmts) {
      if (stmts.length === 0) return [];
      const res = await sql.transaction(stmts.map((s) => sql.query(s.text, (s.params || []) as any[])));
      return res as any[][];
    },
  };
}

export async function createPgliteDb(dataDir?: string): Promise<Db> {
  const { PGlite } = await import('@electric-sql/pglite');
  const pg = new PGlite(dataDir);
  await pg.waitReady;
  return {
    async query(text, params = []) {
      const r = await pg.query(text, params as any[]);
      return r.rows as any[];
    },
    async tx(stmts) {
      return pg.transaction(async (t) => {
        const out: any[][] = [];
        for (const s of stmts) out.push((await t.query(s.text, (s.params || []) as any[])).rows as any[]);
        return out;
      });
    },
  };
}

let cached: Promise<Db> | null = null;

/** يرجّع اتصال قاعدة البيانات المناسب للبيئة */
export function getDb(): Promise<Db> {
  if (cached) return cached;
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
  if (url) {
    cached = Promise.resolve(createNeonDb(url));
  } else if (process.env.LOCAL_PGLITE) {
    cached = createPgliteDb(process.env.LOCAL_PGLITE === 'memory' ? undefined : process.env.LOCAL_PGLITE);
  } else {
    cached = Promise.reject(new Error('DATABASE_URL غير مضبوط'));
    cached.catch(() => { cached = null; });
  }
  return cached;
}

/** للاختبارات فقط */
export function setDbForTests(db: Db | null) {
  cached = db ? Promise.resolve(db) : null;
}
