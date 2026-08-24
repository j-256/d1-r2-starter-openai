import { documentCollectionHandlers } from "../../../features/documents/http.ts";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
    return documentCollectionHandlers.get(request);
}

export async function POST(request: Request): Promise<Response> {
    return documentCollectionHandlers.post(request);
}
