import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import type { DatabaseSync as DatabaseSyncT } from 'node:sqlite';

// Carregado via require: o Vite (usado nos testes) ainda não reconhece o módulo node:sqlite.
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');

/**
 * SQLite embutido do Node 22 (sem dependência nativa).
 * Bom para começar e para testes; para produção com muitos usuários a ideia
 * é trocar por Postgres mantendo as mesmas consultas em `repo.ts`.
 */
export type DB = DatabaseSyncT;

export function openDb(path: string): DB {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      store TEXT NOT NULL,
      external_id TEXT NOT NULL,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      url TEXT NOT NULL,
      image_url TEXT,
      UNIQUE (store, external_id)
    );

    CREATE TABLE IF NOT EXISTS price_points (
      product_id TEXT NOT NULL REFERENCES products(id),
      price INTEGER NOT NULL,
      list_price INTEGER,
      at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS price_points_product_at ON price_points (product_id, at);

    CREATE TABLE IF NOT EXISTS offers (
      product_id TEXT PRIMARY KEY REFERENCES products(id),
      price INTEGER NOT NULL,
      reference_price INTEGER NOT NULL,
      discount_pct INTEGER NOT NULL,
      tier TEXT NOT NULL,
      verified INTEGER NOT NULL,
      inflated INTEGER NOT NULL,
      lowest INTEGER NOT NULL,
      history_days INTEGER NOT NULL,
      detected_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS offers_tier ON offers (tier);

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      secret_hash TEXT NOT NULL UNIQUE,
      push_token TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_categories (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      category TEXT NOT NULL,
      PRIMARY KEY (user_id, category)
    );

    CREATE TABLE IF NOT EXISTS events (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      product_id TEXT,
      category TEXT,
      query TEXT,
      at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS events_user_at ON events (user_id, at);
    CREATE INDEX IF NOT EXISTS events_product_kind_at ON events (product_id, kind, at);

    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      term TEXT NOT NULL,
      max_price INTEGER,
      min_tier TEXT NOT NULL,
      stores TEXT NOT NULL,
      enabled INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pushes (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      product_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS pushes_user_at ON pushes (user_id, at);

    -- Sessões de login (uma por aparelho). Guardamos só o hash do token.
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL
    );

    -- Código de 6 dígitos enviado por e-mail.
    CREATE TABLE IF NOT EXISTS email_codes (
      email TEXT PRIMARY KEY,
      code_hash TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    -- Notificações do plano grátis que saem com atraso.
    CREATE TABLE IF NOT EXISTS pending_pushes (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      product_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      price INTEGER NOT NULL,
      send_after INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS pending_pushes_due ON pending_pushes (send_after);

    -- Pares chave/valor do servidor (ex.: refresh token do Mercado Livre).
    CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL);

    -- Cobranças Pix do Pro (mensal ou anual). Cada pagamento aprovado estende o acesso.
    CREATE TABLE IF NOT EXISTS pix_charges (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      period TEXT NOT NULL,
      amount INTEGER NOT NULL,
      provider TEXT NOT NULL,
      provider_id TEXT NOT NULL UNIQUE,
      qr_code TEXT NOT NULL,
      status TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      paid_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS pix_charges_user ON pix_charges (user_id, created_at);
  `);

  // Colunas adicionadas depois da primeira versão (bancos antigos não as têm).
  const cols = new Set((db.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>).map((c) => c.name));
  if (!cols.has('email')) db.exec('ALTER TABLE users ADD COLUMN email TEXT');
  if (!cols.has('apple_sub')) db.exec('ALTER TABLE users ADD COLUMN apple_sub TEXT');
  if (!cols.has('pro_until')) db.exec('ALTER TABLE users ADD COLUMN pro_until INTEGER');
  const pcols = new Set((db.prepare('PRAGMA table_info(products)').all() as Array<{ name: string }>).map((c) => c.name));
  if (!pcols.has('seller')) db.exec('ALTER TABLE products ADD COLUMN seller TEXT');
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS users_email ON users (email);
    CREATE UNIQUE INDEX IF NOT EXISTS users_apple ON users (apple_sub);
  `);
  return db;
}
