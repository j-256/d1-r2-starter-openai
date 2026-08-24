import assert from "node:assert/strict";
import test from "node:test";
import { sharedSecretAuthorizer } from "../storage/authorizers/shared-secret.ts";

const SECRET = "s3cr3t-value";

function requestWith(headerValue?: string): Request {
    const headers = new Headers();
    if (headerValue !== undefined) headers.set("authorization", headerValue);
    return new Request("http://localhost/api/d1", { headers });
}

test("allows a request with the correct bearer secret", async () => {
    const auth = sharedSecretAuthorizer(SECRET);
    const result = await auth.authorize(requestWith(`Bearer ${SECRET}`));
    assert.deepEqual(result, { ok: true });
});

test("denies a request with a wrong secret", async () => {
    const auth = sharedSecretAuthorizer(SECRET);
    const result = await auth.authorize(requestWith("Bearer wrong"));
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.status, 401);
});

test("denies a request with no authorization header", async () => {
    const auth = sharedSecretAuthorizer(SECRET);
    const result = await auth.authorize(requestWith());
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.status, 401);
});

test("denies a malformed authorization header (no Bearer scheme)", async () => {
    const auth = sharedSecretAuthorizer(SECRET);
    const result = await auth.authorize(requestWith(SECRET));
    assert.equal(result.ok, false);
});

test("fails closed when the expected secret is empty", async () => {
    const auth = sharedSecretAuthorizer("");
    // Even presenting an empty bearer must be denied
    const result = await auth.authorize(requestWith("Bearer "));
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.status, 401);
});

test("denies when presented secret differs in length (constant-time guard)", async () => {
    const auth = sharedSecretAuthorizer(SECRET);
    const result = await auth.authorize(requestWith("Bearer short"));
    assert.equal(result.ok, false);
});
