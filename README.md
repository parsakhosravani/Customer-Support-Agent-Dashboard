# Customer Support Agent Dashboard

SaaS-style support dashboard built with **Next.js + TypeScript** where merchants can:

- Upload FAQs, policies, and documentation
- Chat with an AI support agent (streaming responses)
- See RAG sources used in each reply
- Watch the agent tool timeline step-by-step
- Review conversation history

## Stack

- Next.js App Router + TypeScript
- AI SDK (`ai`) + OpenAI provider
- PostgreSQL + `pgvector` (with in-memory fallback if `DATABASE_URL` is not set)

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Environment variables

- `OPENAI_API_KEY` (optional): enables LLM responses with AI SDK. Without it, the app uses a deterministic fallback streamer.
- `DATABASE_URL` (optional): enables persistence + vector search in PostgreSQL with `pgvector`.

If `DATABASE_URL` is not set, the app runs fully in-memory for quick demos.
