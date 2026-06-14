import { streamText } from "ai";
import { openai } from "@ai-sdk/openai";

import { prepareAgentContext } from "@/lib/agent-tools";
import { saveConversation } from "@/lib/rag-store";

type ChatRequest = {
  merchantId?: string;
  message?: string;
};
const FALLBACK_WORD_DELAY_MS = 25;

function toSseEvent(type: string, payload: unknown): string {
  return `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`;
}

async function* fallbackStream(text: string) {
  const words = text.split(" ");
  for (const word of words) {
    yield `${word} `;
    await new Promise((resolve) => setTimeout(resolve, FALLBACK_WORD_DELAY_MS));
  }
}

export async function POST(request: Request) {
  const body = (await request.json()) as ChatRequest;
  const merchantId = body.merchantId?.trim() || "default-merchant";
  const userMessage = body.message?.trim();

  if (!userMessage) {
    return new Response(JSON.stringify({ error: "Message is required." }), {
      status: 400,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }

  await saveConversation({
    merchantId,
    role: "user",
    content: userMessage,
  });

  const preparation = await prepareAgentContext({
    merchantId,
    query: userMessage,
  });

  const headers = {
    "Content-Type": "text/event-stream",
    Connection: "keep-alive",
    "Cache-Control": "no-cache",
  };

  if (!process.env.OPENAI_API_KEY) {
    const fallbackResponse = `I can help with that. Based on the indexed docs, please review the cited sources and confirm any account-specific details before replying to the customer.`;

    const stream = new ReadableStream({
      async start(controller) {
        controller.enqueue(new TextEncoder().encode(toSseEvent("meta", preparation)));

        let fullText = "";
        for await (const delta of fallbackStream(fallbackResponse)) {
          fullText += delta;
          controller.enqueue(new TextEncoder().encode(toSseEvent("token", { delta })));
        }

        await saveConversation({
          merchantId,
          role: "assistant",
          content: fullText.trim(),
          sources: preparation.sources,
          timeline: preparation.timeline,
        });

        controller.enqueue(new TextEncoder().encode(toSseEvent("done", { done: true })));
        controller.close();
      },
    });

    return new Response(stream, { headers });
  }

  const result = streamText({
    model: openai("gpt-4o-mini"),
    prompt: `You are a support agent for a SaaS merchant.\n\nCustomer question:\n${userMessage}\n\nTool outputs:\n- Ticket summary: ${preparation.ticketSummary}\n- Draft instructions: ${preparation.draftReply}\n\nSources:\n${preparation.sources
      .map((source, index) => `${index + 1}. ${source.title}: ${source.snippet}`)
      .join("\n") || "No indexed documents found."}\n\nReturn a concise, customer-ready answer and explicitly mention when confidence is limited due to missing sources.`,
  });

  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(new TextEncoder().encode(toSseEvent("meta", preparation)));

      let fullText = "";
      for await (const delta of result.textStream) {
        fullText += delta;
        controller.enqueue(new TextEncoder().encode(toSseEvent("token", { delta })));
      }

      await saveConversation({
        merchantId,
        role: "assistant",
        content: fullText,
        sources: preparation.sources,
        timeline: preparation.timeline,
      });

      controller.enqueue(new TextEncoder().encode(toSseEvent("done", { done: true })));
      controller.close();
    },
  });

  return new Response(stream, { headers });
}
