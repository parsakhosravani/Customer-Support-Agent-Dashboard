import { NextResponse } from "next/server";

import { uploadDocument } from "@/lib/rag-store";

export async function POST(request: Request) {
  const formData = await request.formData();
  const merchantId = String(formData.get("merchantId") || "default-merchant");
  const files = formData.getAll("files").filter((item): item is File => item instanceof File);

  if (files.length === 0) {
    return NextResponse.json({ error: "Please provide at least one file." }, { status: 400 });
  }

  const uploaded = await Promise.all(
    files.map(async (file) => {
      const content = await file.text();
      const document = await uploadDocument({
        merchantId,
        title: file.name,
        content,
      });

      return {
        id: document.id,
        title: file.name,
      };
    }),
  );

  return NextResponse.json({ uploaded });
}
