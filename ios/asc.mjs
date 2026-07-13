/**
 * App Store Connect API client (JWT ES256).
 * Usage: node ios/asc.mjs <GET|POST|PATCH|DELETE> <path> [json-body]
 *   e.g. node ios/asc.mjs GET "/v1/apps?filter[bundleId]=com.pbuddy.app"
 * Key: ~/.appstoreconnect/private_keys/AuthKey_W4DU87FYZ9.p8 (Admin)
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { createRequire } from "node:module";
const require = createRequire("/Users/waseemrazakhan/claude/pbuddy-innovator/functions/node_modules/");
const jwt = require("jsonwebtoken");

const KEY_ID = "W4DU87FYZ9";
const ISSUER = "e808fbf5-70a9-4b54-b7d9-deb20603da34";
const key = readFileSync(`${homedir()}/.appstoreconnect/private_keys/AuthKey_${KEY_ID}.p8`);

const token = jwt.sign({}, key, {
  algorithm: "ES256",
  issuer: ISSUER,
  audience: "appstoreconnect-v1",
  expiresIn: "15m",
  header: { kid: KEY_ID, typ: "JWT" },
});

const [method, path, body] = process.argv.slice(2);
const res = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
  method: method || "GET",
  headers: {
    authorization: `Bearer ${token}`,
    ...(body ? { "content-type": "application/json" } : {}),
  },
  ...(body ? { body } : {}),
});
const text = await res.text();
console.log(res.status);
try { console.log(JSON.stringify(JSON.parse(text), null, 1).slice(0, 3000)); }
catch { console.log(text.slice(0, 1000)); }
