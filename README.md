# @nicolasey/ffe-data-download

Fetches the French Chess Federation's national database and unpacks the Access
file from it.

The FFE publishes every licensed player as a zipped Microsoft Access database.
This package does the two boring steps — download, unzip — and hands you the
bytes. Reading them is [`@nicolasey/chess-papi`](https://github.com/nicolasey/chess-papi)'s
job.

## Install

```bash
bun add @nicolasey/ffe-data-download
# or
npm install @nicolasey/ffe-data-download
```

> ESM only, Node 18+ (needs global `fetch`). Ships compiled JavaScript with
> type declarations, so Bun, Node and bundlers all work. One dependency,
> [fflate](https://github.com/101arrowz/fflate), which has none of its own.

## Usage

```ts
import { downloadPapi } from "@nicolasey/ffe-data-download";
import { readPlayers, readClubs } from "@nicolasey/chess-papi";

const result = await downloadPapi();

if (!result.notModified) {
  readClubs(result.data);    // 1,040 clubs
  readPlayers(result.data);  // 644,433 players
}
```

## Not re-downloading 46 MB every night

The archive changes weekly at most. Keep the validators from one run and hand
them back on the next — an unchanged file comes back as a 304 with no body.

```ts
let etag: string | null = null;   // persist this between runs

const result = await downloadPapi({ etag: etag ?? undefined });
etag = result.etag;

if (result.notModified) return;   // nothing to import
await importPlayers(result.data);
```

`lastModified` works the same way and can be passed alongside, for a server
that sends one but not the other.

## Keeping the archive instead

`downloadPapi` throws the 46 MB zip away once it has the 162 MB database. If you
want to cache the smaller thing, take the archive and extract later:

```ts
import { fetchPapiArchive, extractPapi } from "@nicolasey/ffe-data-download";

const archive = await fetchPapiArchive();
if (!archive.notModified) {
  await writeFile("PapiData.zip", archive.data);
  const { data } = extractPapi(archive.data);   // pure, no network
}
```

`extractPapi` is a plain function over bytes, so it also works on an archive you
obtained some other way.

## Memory

These are not small numbers, and they are the reason this package hands back
bytes rather than a stream:

| | Size |
|---|---|
| Archive | ~46 MB |
| Extracted `Data.mdb` | ~162 MB |
| Peak during `downloadPapi` | ~210 MB |

Both the archive and the inflated database are live while unzipping. The
database cannot be streamed into a reader anyway — the Access format needs
random access, so it has to be resident.

Under Node this may need `--max-old-space-size` on a constrained box.

## Sizing and abort

There is no built-in timeout. Bound the request yourself:

```ts
await downloadPapi({ signal: AbortSignal.timeout(120_000) });
```

Two minutes is a reasonable floor for 46 MB on a slow link.

## API

| Export | Description |
|---|---|
| `downloadPapi(options?)` | Download and extract. Returns `PapiDatabase \| NotModified` |
| `fetchPapiArchive(options?)` | Download only. Returns `PapiArchive \| NotModified` |
| `extractPapi(archive, options?)` | Pure extraction. Returns `{ data, filename }` |
| `listEntries(archive)` | Entry names, without inflating anything |
| `PAPI_URL` | `https://www.echecs.asso.fr/Papi/PapiData.zip` |

### Options

| Option | Applies to | Description |
|---|---|---|
| `url` | fetch | Override the source |
| `signal` | fetch | `AbortSignal` |
| `etag` / `lastModified` | fetch | Cache validators from a previous call |
| `fetch` | fetch | Supply your own, for tests or a proxy |
| `filename` | extract | Entry to take. Defaults to the first `.mdb` |

Every result carries `etag` and `lastModified`, whether or not it carries data,
so a caller can always store them.

## Failure modes

- **Non-2xx** throws, naming the URL and the status. An HTML error page never
  reaches the unzipper as if it were an archive.
- **No `.mdb` in the archive** throws, listing what the archive did hold. That
  is the message you want when the FFE changes the format.
- **A named entry that is absent** throws the same way.

## Scope

Downloads and unpacks. It does not parse the database, does not write to disk,
and does not schedule anything — those are yours to choose.

The URL is the FFE's and can change without notice. If it does, pass `url`.

## License

MIT. See [LICENSE](LICENSE).
