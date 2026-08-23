import { describe, it, expect } from "vitest";
import * as crypto from "crypto";
import { verifySignature } from "../src/lib/line.js";

const SECRET = "channel-secret";
const BODY = '{"events":[]}';

function sign(secret: string, body: string): string {
  return crypto.createHmac("sha256", secret).update(body).digest("base64");
}

describe("verifySignature", () => {
  it("accepts a correct signature", () => {
    expect(verifySignature(SECRET, sign(SECRET, BODY), BODY)).toBe(true);
  });

  it("rejects a signature made with the wrong secret", () => {
    expect(verifySignature(SECRET, sign("other", BODY), BODY)).toBe(false);
  });

  it("rejects a signature for different content", () => {
    expect(verifySignature(SECRET, sign(SECRET, '{"events":[1]}'), BODY)).toBe(
      false
    );
  });

  it("fails closed when the channel secret is empty", () => {
    // defineSecret().value() returns "" when the secret failed to load. HMACing
    // with an empty key would let anyone who signs with the same empty key
    // through, so an absent secret must reject rather than verify.
    expect(verifySignature("", sign("", BODY), BODY)).toBe(false);
    expect(verifySignature("", sign(SECRET, BODY), BODY)).toBe(false);
  });

  it("returns false rather than throwing on a short signature", () => {
    // Buffer.compare/timingSafeEqual throws on length mismatch, so this used to
    // surface as an exception rather than a clean 401.
    expect(verifySignature(SECRET, "abc", BODY)).toBe(false);
    expect(verifySignature(SECRET, "", BODY)).toBe(false);
    expect(verifySignature(SECRET, "!!!not base64!!!", BODY)).toBe(false);
  });
});
