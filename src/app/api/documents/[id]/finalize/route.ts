import { apiHandler, json } from "@/lib/api";
import { finalizeUpload } from "@/lib/documents/upload";

export const POST = apiHandler(async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  return json(await finalizeUpload(id));
});
