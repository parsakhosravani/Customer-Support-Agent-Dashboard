import { Pool } from "pg";

import { EMBEDDING_DIMENSION, toEmbedding, vectorLiteral } from "@/lib/embeddings";

export type Source = {
  id: string;
  title: string;
  snippet: string;
};

export type TimelineStep = {
  tool: string;
  status: "started" | "completed";
  detail: string;
};

export type ConversationRecord = {
  id: string;
  merchantId: string;
  role: "user" | "assistant";
  content: string;
  sources: Source[];
  timeline: TimelineStep[];
  createdAt: string;
};

type DocumentRecord = {
  id: string;
  merchantId: string;
  title: string;
  content: string;
  embedding: number[];
};

const memoryDocuments: DocumentRecord[] = [];
const memoryConversations: ConversationRecord[] = [];

let pool: Pool | null = null;
let hasInitialized = false;

function getPool(): Pool | null {
  if (!process.env.DATABASE_URL) {
    return null;
  }

  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }

  return pool;
}

async function initializeSchemaIfNeeded(): Promise<boolean> {
  const clientPool = getPool();

  if (!clientPool) {
    return false;
  }

  if (hasInitialized) {
    return true;
  }

  await clientPool.query("CREATE EXTENSION IF NOT EXISTS vector");
  await clientPool.query(`
    CREATE TABLE IF NOT EXISTS support_documents (
      id TEXT PRIMARY KEY,
      merchant_id TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      embedding vector(${EMBEDDING_DIMENSION}) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await clientPool.query(`
    CREATE TABLE IF NOT EXISTS support_conversations (
      id TEXT PRIMARY KEY,
      merchant_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      sources JSONB NOT NULL,
      timeline JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  hasInitialized = true;
  return true;
}

function makeId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

function toSnippet(content: string): string {
  return content.replace(/\s+/g, " ").trim().slice(0, 220);
}

export async function uploadDocument(input: {
  merchantId: string;
  title: string;
  content: string;
}): Promise<{ id: string }> {
  const id = makeId("doc");
  const embedding = toEmbedding(input.content);
  const isDbReady = await initializeSchemaIfNeeded();

  if (!isDbReady) {
    memoryDocuments.push({ id, ...input, embedding });
    return { id };
  }

  const clientPool = getPool();
  if (!clientPool) {
    memoryDocuments.push({ id, ...input, embedding });
    return { id };
  }

  await clientPool.query(
    `
      INSERT INTO support_documents (id, merchant_id, title, content, embedding)
      VALUES ($1, $2, $3, $4, $5::vector)
    `,
    [id, input.merchantId, input.title, input.content, vectorLiteral(embedding)],
  );

  return { id };
}

export async function searchDocuments(input: {
  merchantId: string;
  query: string;
  limit?: number;
}): Promise<Source[]> {
  const limit = input.limit ?? 3;
  const queryEmbedding = toEmbedding(input.query);
  const isDbReady = await initializeSchemaIfNeeded();

  if (!isDbReady) {
    return memoryDocuments
      .filter((doc) => doc.merchantId === input.merchantId)
      .map((doc) => ({
        doc,
        score: dot(doc.embedding, queryEmbedding),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ doc }) => ({
        id: doc.id,
        title: doc.title,
        snippet: toSnippet(doc.content),
      }));
  }

  const clientPool = getPool();
  if (!clientPool) {
    return [];
  }

  const { rows } = await clientPool.query<{
    id: string;
    title: string;
    content: string;
  }>(
    `
      SELECT id, title, content
      FROM support_documents
      WHERE merchant_id = $1
      ORDER BY embedding <=> $2::vector
      LIMIT $3
    `,
    [input.merchantId, vectorLiteral(queryEmbedding), limit],
  );

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    snippet: toSnippet(row.content),
  }));
}

function dot(a: number[], b: number[]): number {
  return a.reduce((acc, value, index) => acc + value * (b[index] ?? 0), 0);
}

export async function saveConversation(input: {
  merchantId: string;
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  timeline?: TimelineStep[];
}): Promise<void> {
  const record: ConversationRecord = {
    id: makeId("conv"),
    merchantId: input.merchantId,
    role: input.role,
    content: input.content,
    sources: input.sources ?? [],
    timeline: input.timeline ?? [],
    createdAt: new Date().toISOString(),
  };

  const isDbReady = await initializeSchemaIfNeeded();

  if (!isDbReady) {
    memoryConversations.push(record);
    return;
  }

  const clientPool = getPool();
  if (!clientPool) {
    memoryConversations.push(record);
    return;
  }

  await clientPool.query(
    `
      INSERT INTO support_conversations (id, merchant_id, role, content, sources, timeline)
      VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)
    `,
    [
      record.id,
      record.merchantId,
      record.role,
      record.content,
      JSON.stringify(record.sources),
      JSON.stringify(record.timeline),
    ],
  );
}

export async function getConversationHistory(
  merchantId: string,
): Promise<ConversationRecord[]> {
  const isDbReady = await initializeSchemaIfNeeded();

  if (!isDbReady) {
    return memoryConversations
      .filter((conversation) => conversation.merchantId === merchantId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  const clientPool = getPool();
  if (!clientPool) {
    return [];
  }

  const { rows } = await clientPool.query<{
    id: string;
    merchant_id: string;
    role: "user" | "assistant";
    content: string;
    sources: Source[];
    timeline: TimelineStep[];
    created_at: string;
  }>(
    `
      SELECT id, merchant_id, role, content, sources, timeline, created_at
      FROM support_conversations
      WHERE merchant_id = $1
      ORDER BY created_at ASC
    `,
    [merchantId],
  );

  return rows.map((row) => ({
    id: row.id,
    merchantId: row.merchant_id,
    role: row.role,
    content: row.content,
    sources: row.sources,
    timeline: row.timeline,
    createdAt: row.created_at,
  }));
}
