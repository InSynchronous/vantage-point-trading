import { NextRequest, NextResponse } from "next/server";
import { generateProtocol } from "@/lib/ai-build";

// POST /api/ai/build { prompt } -> validated protocol graph (never trusted blindly)
export async function POST(req: NextRequest) {
  try {
    const { prompt } = await req.json();
    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      return NextResponse.json({ error: "Describe the strategy first." }, { status: 400 });
    }
    const graph = await generateProtocol(prompt);
    return NextResponse.json(graph);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Build failed" }, { status: 502 });
  }
}
