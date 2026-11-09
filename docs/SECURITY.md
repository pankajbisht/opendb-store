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

## Treat stored data as untrusted input

Users, browser extensions, and other scripts can change stored values. Validate anything you read before
using it for authorization or rendering it as HTML.

## Namespaces are not a security boundary

A namespace prevents accidental collisions. It does not stop other code on the same origin from reading
or changing your keys.

## On a server

Without a `window`, stores keep data in memory shared by the whole Node process. In server-side code, do
not write anything specific to a user or request, because other requests can read it.

## Reporting a vulnerability

Please report privately through
[GitHub security advisories](https://github.com/pankajbisht/opendb-store/security/advisories/new) rather
than in a public issue. Private vulnerability reporting must be enabled on the repository for this link
to work; that is a Phase 6 task in the [plan](PRODUCTION_PLAN.md).
