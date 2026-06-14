"use client";

import { FormEvent, useCallback, useMemo, useState } from "react";
import type { ConversationRecord as Conversation, Source, TimelineStep } from "@/lib/types";

const textDecoder = new TextDecoder();
const MAX_RECENT_CONVERSATIONS = 10;

export default function Home() {
  const [merchantId, setMerchantId] = useState("default-merchant");
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");
  const [conversationHistory, setConversationHistory] = useState<Conversation[]>([]);
  const [assistantDraft, setAssistantDraft] = useState("");
  const [latestSources, setLatestSources] = useState<Source[]>([]);
  const [latestTimeline, setLatestTimeline] = useState<TimelineStep[]>([]);

  const loadHistory = useCallback(async () => {
    const response = await fetch(`/api/conversations?merchantId=${encodeURIComponent(merchantId)}`);
    const payload = (await response.json()) as { conversations: Conversation[] };
    setConversationHistory(payload.conversations);
  }, [merchantId]);

  const recentConversations = useMemo(
    () => conversationHistory.slice(-MAX_RECENT_CONVERSATIONS),
    [conversationHistory],
  );
  const handleRefreshHistory = () => {
    void loadHistory();
  };

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fileInput = form.elements.namedItem("files") as HTMLInputElement | null;

    if (!fileInput?.files || fileInput.files.length === 0) {
      setUploadStatus("Select at least one document to upload.");
      return;
    }

    const formData = new FormData();
    formData.set("merchantId", merchantId);

    Array.from(fileInput.files).forEach((file) => {
      formData.append("files", file);
    });

    const response = await fetch("/api/documents", {
      method: "POST",
      body: formData,
    });

    const payload = (await response.json()) as { uploaded?: { title: string }[]; error?: string };

    if (!response.ok) {
      setUploadStatus(payload.error || "Upload failed.");
      return;
    }

    setUploadStatus(`Indexed ${payload.uploaded?.length ?? 0} file(s).`);
    form.reset();
  }

  async function handleSendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!message.trim() || isSending) {
      return;
    }

    setIsSending(true);
    setAssistantDraft("");
    setLatestSources([]);
    setLatestTimeline([]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          merchantId,
          message,
        }),
      });

      if (!response.ok || !response.body) {
        setAssistantDraft("Failed to generate a response.");
        return;
      }

      const reader = response.body.getReader();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += textDecoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() || "";

        for (const event of events) {
          const typeMatch = event.match(/event: (.+)/);
          const dataMatch = event.match(/data: (.+)/);

          if (!typeMatch || !dataMatch) {
            continue;
          }

          const eventType = typeMatch[1];
          const data = JSON.parse(dataMatch[1]) as {
            delta?: string;
            sources?: Source[];
            timeline?: TimelineStep[];
          };

          if (eventType === "meta") {
            setLatestSources(data.sources || []);
            setLatestTimeline(data.timeline || []);
          }

          if (eventType === "token" && data.delta) {
            setAssistantDraft((current) => current + data.delta);
          }
        }
      }

      setMessage("");
      await loadHistory();
    } finally {
      setIsSending(false);
    }
  }

  return (
    <main className="dashboard">
      <section className="card">
        <h1>Customer Support Agent Dashboard</h1>
        <p>Upload merchant documentation, chat with an AI support agent, inspect sources (RAG), and review execution timeline.</p>

        <label className="field">
          Merchant ID
          <input
            value={merchantId}
            onChange={(event) => setMerchantId(event.target.value)}
            placeholder="default-merchant"
          />
        </label>
      </section>

      <section className="card">
        <h2>1) Upload docs, FAQs, and policies</h2>
        <form onSubmit={handleUpload} className="stack">
          <input name="files" type="file" multiple />
          <button type="submit">Upload + Index</button>
        </form>
        {uploadStatus ? <p className="status">{uploadStatus}</p> : null}
      </section>

      <section className="card">
        <h2>2) Chat with AI support agent</h2>
        <form onSubmit={handleSendMessage} className="stack">
          <textarea
            rows={4}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Example: customer says they were charged twice. What should I reply?"
          />
          <button type="submit" disabled={isSending}>
            {isSending ? "Streaming response..." : "Send"}
          </button>
        </form>
        {assistantDraft ? (
          <article className="assistantReply">
            <h3>Assistant response (streaming)</h3>
            <p>{assistantDraft}</p>
          </article>
        ) : null}
      </section>

      <section className="card grid2">
        <div>
          <h2>RAG sources used</h2>
          {latestSources.length === 0 ? (
            <p>No sources used yet.</p>
          ) : (
            <ul className="stackList">
              {latestSources.map((source) => (
                <li key={source.id}>
                  <strong>{source.title}</strong>
                  <p>{source.snippet}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h2>Agent execution timeline</h2>
          {latestTimeline.length === 0 ? (
            <p>No timeline yet.</p>
          ) : (
            <ul className="stackList">
              {latestTimeline.map((step) => (
                <li key={step.id}>
                  <strong>{step.tool}</strong> ({step.status})
                  <p>{step.detail}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="card">
        <h2>Conversation history</h2>
        <button type="button" onClick={handleRefreshHistory}>
          Refresh history
        </button>
        {recentConversations.length === 0 ? (
          <p>No conversations yet.</p>
        ) : (
          <ul className="history">
            {recentConversations.map((entry) => (
              <li key={entry.id}>
                <span className="role">{entry.role}</span>
                <p>{entry.content}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
