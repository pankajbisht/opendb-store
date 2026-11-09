# Examples

Working examples of `opendb-store`, one per folder.

## Run them

From the repository root:

```sh
npm run demo
```

This builds the library and serves the examples at <http://127.0.0.1:4321/public/>. Set `PORT` to use another
port.

## Folder structure

```text
public/
├── index.html          the list of examples
├── README.md
├── shared/
│   ├── styles.css      styling shared by every page
│   └── ui.js           small DOM helpers, unrelated to the library
└── examples/
    └── <example>/
        ├── index.html  the page, and an import map pointing at dist/
        └── main.js     the code to read
```

The import map lets each `main.js` use `import db from 'opendb-store'`, so the code works unchanged in a real
project.

## Examples

| Example | What it shows |
| --- | --- |
| [`basics`](examples/basics/main.js) | Save, read, check, and remove a value. It survives a page reload. |
| [`expiry`](examples/expiry/main.js) | Give a value a lifetime and watch it disappear by itself. |
| [`theme-sync`](examples/theme-sync/main.js) | Subscribers hear about changes from this tab and from your other tabs. |
| [`api-cache`](examples/api-cache/main.js) | Serve repeat requests from storage and refetch only when the data is stale. |
| [`form-draft`](examples/form-draft/main.js) | Type, then reload. The draft stays in this tab until you submit it. |
| [`cookie-consent`](examples/cookie-consent/main.js) | Remember a choice for a year in a cookie that your server can also read. |
| [`shopping-cart`](examples/shopping-cart/main.js) | Keep a cart between visits and query it with the helpers from opendb-store/query. |
| [`user-accounts`](examples/user-accounts/main.js) | Each user gets a namespace, so logging out removes only that user's data. |
| [`schema-migration`](examples/schema-migration/main.js) | Change your data shape without breaking returning users. Old entries upgrade when first read. |
| [`error-handling`](examples/error-handling/main.js) | Operations never throw. Every failure returns a result and reaches one handler. |
| [`storage-debug`](examples/storage-debug/main.js) | See how much each storage is using, and which keys are the largest. |

## Add an example

1. Copy a folder in `examples/` and rename it.
2. Change the title and code.
3. Add a card for it to `index.html`, and a row to this table.
