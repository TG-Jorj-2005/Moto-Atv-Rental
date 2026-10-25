import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { uploadFilePath, contentTypeFor } from "@/lib/uploads";

export const dynamic = "force-dynamic";

// Serves a photo that an owner uploaded. Only a single file name made of safe characters is accepted, so nothing
// outside the upload directory can ever be read.
export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const target = path.length === 1 ? uploadFilePath(path[0]!) : null;
  if (!target) return new NextResponse("Not found", { status: 404 });
  try {
    const data = await readFile(target);
    return new NextResponse(new Uint8Array(data), {
      headers: { "Content-Type": contentTypeFor(path[0]!), "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
