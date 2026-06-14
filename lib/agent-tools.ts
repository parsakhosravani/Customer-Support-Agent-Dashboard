import { getConversationHistory, searchDocuments } from "@/lib/rag-store";
import type { Source, TimelineStep } from "@/lib/types";

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
  let stepCounter = 0;
  const addStep = (tool: string, status: "started" | "completed", detail: string) => {
    stepCounter += 1;
    timeline.push({ id: `step-${stepCounter}`, tool, status, detail });
  };

  addStep("search_docs", "started", "Searching indexed documentation for relevant context.");
  const sources = await searchDocuments({
    merchantId: input.merchantId,
    query: input.query,
    limit: 3,
  });
  addStep("search_docs", "completed", `Retrieved ${sources.length} supporting source(s).`);

  addStep("summarize_tickets", "started", "Summarizing recent merchant conversations.");
  const history = await getConversationHistory(input.merchantId);
  const recentTickets = history
    .filter((entry) => entry.role === "user")
    .slice(-3)
    .map((entry) => entry.content);

  const ticketSummary =
    recentTickets.length > 0
      ? `Recent customer concerns: ${recentTickets.join(" | ")}`
      : "No previous tickets are available for this merchant yet.";

  addStep(
    "summarize_tickets",
    "completed",
    recentTickets.length > 0 ? "Created a ticket summary from recent history." : "No prior tickets found.",
  );

  addStep("generate_reply", "started", "Drafting a response strategy before final answer generation.");

  const sourceTitles = sources.map((source) => source.title).join(", ");
  const draftReply =
    sources.length > 0
      ? `Use the policy snippets from ${sourceTitles} and respond with concise action items.`
      : "Provide a helpful response and ask for clarifying details due to missing indexed docs.";

  addStep("generate_reply", "completed", "Prepared draft response instructions for the final answer.");

  return {
    sources,
    timeline,
    ticketSummary,
    draftReply,
  };
}
