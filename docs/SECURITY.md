# Security

## What this library does not protect against

`localStorage` and `sessionStorage` are plain text and readable by any script running on your origin. A
single cross-site scripting (XSS) flaw, or a compromised third-party script, exposes everything stored.
Expiry is enforced by the library only; the data stays readable until it is removed.

## Do not store

- Passwords, API keys, or private keys
- Long-lived session or refresh tokens; prefer `HttpOnly`, `Secure`, `SameSite` cookies
- Payment details or sensitive personal data

## Cookies

- JavaScript cannot set `HttpOnly`, so cookies written by this library are readable by any script on the page.
  Session and authentication cookies should be set by your server with `HttpOnly`.
- Cookies are sent to your server on every matching request. Do not trust their contents there either.
- The defaults are `SameSite=Lax` and `Secure` on HTTPS. Be careful when widening them.
- `SameSite=None` needs `secure: true`, and a broad `domain` exposes the cookie to every subdomain.

## IndexedDB

IndexedDB is readable by any script on your origin, and it is not encrypted. The `serializer` option can encrypt
values, but it runs synchronously and leaves expiry readable. On a server it keeps nothing, as with the other stores.

## Compression

Compressed values are no more private than plain ones; compression is not encryption. Decompression checks every
character and code, and refuses to produce more than `maxLength` characters, 50 million by default. A tampered
value therefore fails with `CORRUPT_VALUE` instead of using up memory.

## Treat stored data as untrusted input

Users, browser extensions, and other scripts can change stored values. Validate anything you read before
using it for authorization or rendering it as HTML. The `validate` option does this on every read, for example
with a Zod schema.

The library protects itself against tampered data: non-numeric expiry and version fields are ignored, stored
`__proto__` keys cannot change an object's prototype, and query helpers read own fields only. It cannot tell
you whether a well-formed value is genuine.

## Namespaces are not a security boundary

A namespace prevents accidental collisions. It does not stop other code on the same origin from reading
or changing your keys.

## On a server

Without a `window`, stores keep nothing. Reads return defaults, and writes return `false`, so data from one
request cannot reach another.

If you pass `createMemoryAdapter()` yourself, that memory lives as long as the store. Do not share such a store
between requests.

## Content Security Policy

The library never uses `eval`, `new Function`, or HTML injection. `npm run test:csp` loads every browser bundle
under `script-src 'self'` with Trusted Types enforced, in Chromium, Firefox, and WebKit.

## Reporting a vulnerability

Please report privately through
[GitHub security advisories](https://github.com/pankajbisht/opendb-store/security/advisories/new) rather
than in a public issue. Private vulnerability reporting must be enabled on the repository for this link
to work; that is a Phase 6 task in the [plan](PRODUCTION_PLAN.md).
