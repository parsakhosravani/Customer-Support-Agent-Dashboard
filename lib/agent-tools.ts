import { getConversationHistory, searchDocuments, type Source, type TimelineStep } from "@/lib/rag-store";

export type AgentPreparation = {
  sources: Source[];
  timeline: TimelineStep[];
  ticketSummary: string;
  draftReply: string;
};

export async function prepareAgentContext(input: {
  merchantId: string;
  query: string;
}): Promise<AgentPreparation> {
  const timeline: TimelineStep[] = [];

  timeline.push({
    tool: "search_docs",
    status: "started",
    detail: "Searching indexed documentation for relevant context.",
  });
  const sources = await searchDocuments({
    merchantId: input.merchantId,
    query: input.query,
    limit: 3,
  });
  timeline.push({
    tool: "search_docs",
    status: "completed",
    detail: `Retrieved ${sources.length} supporting source(s).`,
  });

  timeline.push({
    tool: "summarize_tickets",
    status: "started",
    detail: "Summarizing recent merchant conversations.",
  });
  const history = await getConversationHistory(input.merchantId);
  const recentTickets = history
    .filter((entry) => entry.role === "user")
    .slice(-3)
    .map((entry) => entry.content);

  const ticketSummary =
    recentTickets.length > 0
      ? `Recent customer concerns: ${recentTickets.join(" | ")}`
      : "No previous tickets are available for this merchant yet.";

  timeline.push({
    tool: "summarize_tickets",
    status: "completed",
    detail: recentTickets.length > 0 ? "Created a ticket summary from recent history." : "No prior tickets found.",
  });

  timeline.push({
    tool: "generate_reply",
    status: "started",
    detail: "Drafting a response strategy before final answer generation.",
  });

  const draftReply =
    sources.length > 0
      ? `Use the policy snippets from ${sources.map((source) => source.title).join(", ")} and respond with concise action items.`
      : "Provide a helpful response and ask for clarifying details due to missing indexed docs.";

  timeline.push({
    tool: "generate_reply",
    status: "completed",
    detail: "Prepared draft response instructions for the final answer.",
  });

  return {
    sources,
    timeline,
    ticketSummary,
    draftReply,
  };
}
