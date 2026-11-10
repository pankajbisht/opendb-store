# How opendb-store works

Visual guides to the library. GitHub renders these diagrams directly. In an editor, use a Mermaid preview.

1. [Which store should I use?](#1-which-store-should-i-use)
2. [How the package fits together](#2-how-the-package-fits-together)
3. [Choosing where data lives](#3-choosing-where-data-lives)
4. [Reading a value](#4-reading-a-value)
5. [Listing without decoding](#5-listing-without-decoding)
6. [Writing a value](#6-writing-a-value)
7. [Change notifications](#7-change-notifications)
8. [IndexedDB: an atomic patch](#8-indexeddb-an-atomic-patch)
9. [Least-recently-used cache](#9-least-recently-used-cache)
10. [From commit to npm](#10-from-commit-to-npm)

## 1. Which store should I use?

```mermaid
flowchart TD
    start([What are you storing?]) --> server{Must the server<br/>read it?}
    server -- Yes --> cookie["db.cookie<br/>about 4 KB, sent with every request"]
    server -- No --> tab{Only for this tab,<br/>until it closes?}
    tab -- Yes --> session["db.session<br/>5 MB, per tab"]
    tab -- No --> big{Large, binary, or<br/>over a few hundred KB?}
    big -- Yes --> idb["indexed<br/>from opendb-store/indexeddb<br/>gigabytes, Date, Map, Blob"]
    big -- No --> cache{A cache that should<br/>never grow too big?}
    cache -- Yes --> lru["createCache<br/>from opendb-store/cache"]
    cache -- No --> local["db.local<br/>5 MB, every tab"]
    local -. "running out of room?" .-> zip["serializer: compressed()<br/>from opendb-store/compress"]
```

## 2. How the package fits together

```mermaid
flowchart LR
    subgraph core["opendb-store (core)"]
        direction TB
        entry["index.ts<br/>db, createStore"] --> store["store.ts<br/>validates options,<br/>builds the store"]
        store --> ops["operations/<br/>get set has patch remove<br/>keys size subscribe"]
        ops --> codec["codec/<br/>key and entry format,<br/>metadata reading"]
        ops --> adapters["adapters/<br/>local, session, cookie,<br/>memory, server"]
    end

    subgraph extra["Optional entry points"]
        direction TB
        idb["indexeddb<br/>asynchronous store"]
        compress["compress<br/>smaller values"]
        query["query<br/>where, pluck, pick"]
        debug["debug<br/>size reports"]
        cachemod["cache<br/>size-limited stores"]
        react["react<br/>useStored hook"]
    end

    adapters --> browser[("Browser storage")]
    idb --> idbstore[("IndexedDB")]
    compress -. "plugs in as a serializer" .-> store
    query -. "reads through" .-> entry
    debug -. "measures" .-> entry
    cachemod -. "wraps" .-> entry
    react -. "subscribes to" .-> entry
```

Each optional entry point is a separate import, so it adds nothing for people who do not use it.

## 3. Choosing where data lives

This runs once, on a store's first operation. Creating a store touches nothing.

```mermaid
flowchart TD
    first([First operation on a store]) --> custom{Custom adapter<br/>passed in?}
    custom -- Yes --> use[Use it as given]
    custom -- No --> window{Is there a window?}
    window -- "No: a server" --> nothing["Keep nothing<br/>reads return defaults,<br/>writes return false"]
    window -- Yes --> probed{Already checked<br/>on this page?}
    probed -- Yes --> real[Use real storage]
    probed -- No --> probe["Write and remove<br/>a test key"]
    probe -- Works --> real
    probe -- "Full, but works" --> real
    probe -- "Blocked or missing" --> memory["Use memory for this tab<br/>report STORAGE_UNAVAILABLE once"]
```

A server keeps nothing because memory shared by the whole process would let one visitor's data reach another.

## 4. Reading a value

`get(key, default)` on a local, session, or cookie store.

```mermaid
flowchart TD
    get(["get(key, default)"]) --> valid{Valid key?}
    valid -- No --> dflt[Return default]
    valid -- Yes --> read[Read stored text]
    read --> exists{Found?}
    exists -- No --> dflt
    exists -- Yes --> decode[Decode, and decompress<br/>if it was compressed]
    decode -- "Cannot decode" --> corrupt["Report CORRUPT_VALUE"] --> dflt
    decode --> mine{"Has a value field?<br/>(written by this library)"}
    mine -- No --> dflt
    mine -- Yes --> expired{Expired?}
    expired -- Yes --> remove["Delete it,<br/>notify subscribers"] --> dflt
    expired -- No --> old{Older schema<br/>version?}
    old -- Yes --> migrate["Run migrate,<br/>save the result"] --> check
    old -- No --> check{"validate option<br/>accepts it?"}
    check -- No --> invalid["Report VALIDATION_FAILED"] --> dflt
    check -- Yes --> value([Return the value])
```

## 5. Listing without decoding

`keys`, `count`, `has`, `ttl`, `size`, and `purgeExpired` only need each entry's expiry. Entries are always written
with metadata last, so it can be read from the end of the text.

```mermaid
flowchart LR
    text["Stored text<br/>{&quot;value&quot;:…,&quot;expire&quot;:1731…}"] --> start{Starts with<br/>a value field?}
    start -- No --> full[Decode the whole entry]
    start -- Yes --> tail["Read the last<br/>96 characters"]
    tail --> sure{Ending is clearly<br/>this library's?}
    sure -- No --> full
    sure -- Yes --> meta["Expiry and version,<br/>value never decoded"]
    full --> meta2[Expiry and version]
```

When it is not certain, it decodes the whole entry, so this shortcut can only save time. It never changes an answer.

## 6. Writing a value

```mermaid
flowchart TD
    set(["set(key, value, { expire })"]) --> checks{"Valid key, options,<br/>and value?"}
    checks -- No --> fail1["Report INVALID_KEY, INVALID_ARGUMENT,<br/>or SERIALIZE_FAILED"] --> no([Return false])
    checks -- Yes --> build["Build entry<br/>{ value, expire, v }"]
    build --> serialize["Serialize<br/>(compress if configured<br/>and actually smaller)"]
    serialize -- Fails --> fail2["Report SERIALIZE_FAILED"] --> no
    serialize --> write[Write to storage]
    write -- Works --> notify[Notify subscribers] --> yes([Return true])
    write -- "Storage full" --> purge["Delete expired entries"]
    purge -- "Freed some" --> retry[Write again]
    purge -- "Nothing to free" --> full["Report QUOTA_EXCEEDED"] --> no
    retry -- Works --> notify
    retry -- Fails --> full
```

Operations never throw. Every failure reaches `onError`, or `console.warn` when no handler is set.

## 7. Change notifications

```mermaid
sequenceDiagram
    autonumber
    participant A as Tab A: your code
    participant SA as Tab A: store
    participant B as Storage
    participant SB as Tab B: store
    participant L as Tab B: listener

    A->>SA: set("theme", "dark")
    SA->>B: write
    SA-->>A: same-tab subscribers called at once
    alt localStorage
        B-->>SB: browser fires a storage event
    else IndexedDB
        SA-->>SB: BroadcastChannel message
    else Cookies
        B-->>SB: CookieStore change event, where supported
    end
    SB->>B: read the current value
    SB->>L: listener("dark")
```

For local, session, and cookie stores, a listener is only called when the stored text actually changed. A listener
that writes its own key is not called again for that write.

## 8. IndexedDB: an atomic patch

Read and write happen in one transaction, so concurrent patches cannot overwrite each other.

```mermaid
sequenceDiagram
    participant Code as Your code
    participant Store as Indexed store
    participant TX as Transaction (readwrite)
    participant DB as IndexedDB

    Code->>Store: patch("cart", { qty: 2 })
    Store->>TX: open
    TX->>DB: get "app.cart"
    DB-->>TX: current record
    Note over TX: expire? migrate? merge<br/>all synchronous, inside<br/>the transaction
    TX->>DB: put merged record
    TX-->>Store: committed
    Store-->>Code: true
    Store-)Store: notify subscribers and other tabs
```

A write resolves only after the transaction commits, because browsers can report a full disk at commit time.

## 9. Least-recently-used cache

```mermaid
flowchart TD
    set(["cache.set(key, value)"]) --> write[Write value to its store]
    write --> order["Move key to the newest end<br/>of the usage order"]
    order --> over{More entries<br/>than maxEntries?}
    over -- No --> done([Done])
    over -- Yes --> evict["Remove the least recently<br/>used entry"] --> over

    get(["cache.get(key)"]) --> hit{Found?}
    hit -- No --> miss([Return default])
    hit -- Yes --> touch["Move key to the newest end"] --> ret([Return value])
```

## 10. From commit to npm

```mermaid
flowchart LR
    pr[Pull request] --> ci["CI<br/>tests on Node 22 and 24,<br/>Chromium, Firefox, WebKit,<br/>package checks"]
    ci -- Passes --> merge{Merged into}
    merge -- next --> pre["Release job<br/>3.0.0-next.N<br/>npm tag: next"]
    merge -- master --> rel["Release job<br/>3.0.0<br/>npm tag: latest"]
    pre --> npm[(npm, with provenance)]
    rel --> npm
    rel --> gh["GitHub release<br/>and CHANGELOG.md"]
```

The release job installs without running dependency scripts, checks the package again before publishing, and
signs it with npm provenance.
