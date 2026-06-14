import { NextResponse } from "next/server";

import { getConversationHistory } from "@/lib/rag-store";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const merchantId = searchParams.get("merchantId") || "default-merchant";
  const conversations = await getConversationHistory(merchantId);

  return NextResponse.json({ conversations });
}
