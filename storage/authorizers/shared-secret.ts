import type { Authorizer, AuthResult } from "../authorizer.ts";

const BEARER_PREFIX = "Bearer ";
const DENIED: AuthResult = {
    ok: false,
    status: 401,
    error: "A valid bearer secret is required.",
};

/** Constant-time string comparison; returns false immediately on length mismatch */
function timingSafeEqual(left: string, right: string): boolean {
    if (left.length !== right.length) return false;
    let mismatch = 0;
    for (let index = 0; index < left.length; index += 1) {
        mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
    }
    return mismatch === 0;
}

/**
 * Builds an Authorizer that accepts requests carrying
 * `authorization: Bearer <expectedSecret>`. Platform-neutral: it takes the
 * already-resolved secret string and reads no env. Fails closed when the
 * expected secret is empty, so a deployment that forgot to set a secret
 * denies everything rather than allowing all
 */
export function sharedSecretAuthorizer(expectedSecret: string): Authorizer {
    return {
        async authorize(request: Request): Promise<AuthResult> {
            if (!expectedSecret) return DENIED;

            const header = request.headers.get("authorization");
            if (!header || !header.startsWith(BEARER_PREFIX)) return DENIED;

            const presented = header.slice(BEARER_PREFIX.length);
            return timingSafeEqual(presented, expectedSecret)
                ? { ok: true }
                : DENIED;
        },
    };
}
