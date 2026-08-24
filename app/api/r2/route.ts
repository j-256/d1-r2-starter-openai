import { createTextStoreRoute } from "../../../routes/text-store-route";

export const dynamic = "force-dynamic";

const route = createTextStoreRoute("r2");

export function GET(request: Request): Promise<Response> {
    return route.get(request);
}

export function PUT(request: Request): Promise<Response> {
    return route.put(request);
}

export function DELETE(request: Request): Promise<Response> {
    return route.delete(request);
}
