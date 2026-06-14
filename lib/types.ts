export type Source = {
  id: string;
  title: string;
  snippet: string;
};

export type TimelineStep = {
  id: string;
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
