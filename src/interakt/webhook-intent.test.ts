import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";
import { resolveIntent, verifySignature } from "./webhook-intent";

const SECRET = "test-secret";

function sign(body: string, env = "master", t = 1700000000000): string {
  const payload = JSON.stringify({ Body: body, EnvironmentName: env, TimeStamp: t });
  const hash = createHmac("sha256", SECRET).update(payload).digest("base64");
  return `sign=${hash}, env=${env}, t=${t}`;
}

describe("verifySignature", () => {
  const body = '{"operation":"publish","data":{"__typename":"Product","id":"abc"}}';

  it("accepts a correctly signed body", () => {
    assert.equal(verifySignature(body, sign(body), SECRET), true);
  });

  it("rejects a tampered body", () => {
    const header = sign(body);
    assert.equal(verifySignature(body.replace("abc", "xyz"), header, SECRET), false);
  });

  it("rejects the wrong secret", () => {
    assert.equal(verifySignature(body, sign(body), "other-secret"), false);
  });

  it("rejects a missing or malformed header", () => {
    assert.equal(verifySignature(body, null, SECRET), false);
    assert.equal(verifySignature(body, "sign=abc", SECRET), false);
  });

  it("is sensitive to re-serialisation, which is why the raw body is used", () => {
    const header = sign(body);
    const reSerialised = JSON.stringify(JSON.parse(body));
    assert.notEqual(reSerialised, body.replace(/\s/g, "") === body ? "" : body);
    // Same data, different bytes would break the HMAC — guard the assumption.
    assert.equal(verifySignature(`${body} `, header, SECRET), false);
  });
});

describe("resolveIntent", () => {
  const product = { __typename: "Product", id: "p1" };

  it("upserts on publish", () => {
    const intent = resolveIntent({ operation: "publish", data: product });
    assert.equal(intent.action, "upsert");
    assert.equal(intent.index, "products");
    assert.equal(intent.uniqueId, "product:p1");
  });

  it("deletes on unpublish and on delete", () => {
    for (const operation of ["unpublish", "delete"]) {
      const intent = resolveIntent({ operation, data: product });
      assert.equal(intent.action, "delete", operation);
      assert.equal(intent.uniqueId, "product:p1");
    }
  });

  it("ignores draft churn", () => {
    for (const operation of ["create", "update"]) {
      assert.equal(resolveIntent({ operation, data: product }).action, "ignore", operation);
    }
  });

  it("routes each indexed type to the right index and prefix", () => {
    const cases: [string, string, string][] = [
      ["Article", "content", "guide:x"],
      ["BlogPost", "content", "journal:x"],
      ["FaqItem", "content", "faq:x"],
      ["PolicyPage", "content", "policy:x"],
      ["Author", "content", "author:x"],
      ["Product", "products", "product:x"],
    ];
    for (const [typename, index, uniqueId] of cases) {
      const intent = resolveIntent({ operation: "publish", data: { __typename: typename, id: "x" } });
      assert.equal(intent.index, index, typename);
      assert.equal(intent.uniqueId, uniqueId, typename);
    }
  });

  it("ignores models that are not indexed", () => {
    const intent = resolveIntent({
      operation: "publish",
      data: { __typename: "ProductCategory", id: "c1" },
    });
    assert.equal(intent.action, "ignore");
  });

  it("ignores a payload with no typename or id", () => {
    assert.equal(resolveIntent({ operation: "publish", data: {} }).action, "ignore");
    assert.equal(resolveIntent({}).action, "ignore");
  });

  it("is case-insensitive about the operation", () => {
    assert.equal(resolveIntent({ operation: "Publish", data: product }).action, "upsert");
    assert.equal(resolveIntent({ operation: "DELETE", data: product }).action, "delete");
  });
});
