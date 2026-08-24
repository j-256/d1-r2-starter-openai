/**
 * Provider-neutral authorization boundary. Routes call authorize(request)
 * before any storage access. There is intentionally no allow-all default:
 * the composition root must supply a concrete Authorizer, so the auth
 * decision is always explicit.
 */
export type AuthResult =
    | { ok: true }
    | { ok: false; status: number; error: string };

export interface Authorizer {
    authorize(request: Request): Promise<AuthResult>;
}
