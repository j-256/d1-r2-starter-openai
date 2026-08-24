import { documentItemHandlers } from "../../../../features/documents/http.ts";

type RouteContext = {
    params: Promise<{ id: string }>;
};

export const dynamic = "force-dynamic";

export async function DELETE(
    request: Request,
    context: RouteContext
): Promise<Response> {
    const { id } = await context.params;
    return documentItemHandlers.delete(request, id);
}

export async function GET(
    request: Request,
    context: RouteContext
): Promise<Response> {
    const { id } = await context.params;
    return documentItemHandlers.get(request, id);
}
