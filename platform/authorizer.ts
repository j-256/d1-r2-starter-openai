export type AuthResult =
    | { ok: true }
    | { ok: false; status: number; error: string };

export interface Authorizer {
    authorize(request: Request): Promise<AuthResult>;
}
