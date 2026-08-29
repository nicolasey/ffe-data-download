import { describe, expect, test } from "bun:test";
import { zipSync } from "fflate";
import { downloadPapi, fetchPapiArchive } from "../src/download.js";
import { PAPI_URL } from "../src/types.js";

const mdb = new TextEncoder().encode("Access bytes");
const zip = zipSync({ "Data.mdb": mdb });

/** A fetch that records what it was called with and answers as told. */
function stubFetch(response: Response) {
  const calls: Array<{ url: string; headers: Record<string, string> }> = [];
  const fn = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(url),
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
    });
    return response;
  }) as unknown as typeof globalThis.fetch;
  return { fetch: fn, calls };
}

function zipResponse(init: ResponseInit = {}) {
  return new Response(zip, {
    status: 200,
    headers: { etag: '"abc123"', "last-modified": "Fri, 21 Aug 2026 09:13:00 GMT" },
    ...init,
  });
}

describe("fetchPapiArchive", () => {
  test("goes to the FFE by default", async () => {
    const stub = stubFetch(zipResponse());
    await fetchPapiArchive({ fetch: stub.fetch });

    expect(stub.calls[0]!.url).toBe(PAPI_URL);
  });

  test("goes where it is told when given a url", async () => {
    // The documented escape hatch for the day the FFE moves the file, or for
    // pointing at a local mirror. Asserting the default alone cannot see it.
    const stub = stubFetch(zipResponse());
    await fetchPapiArchive({ fetch: stub.fetch, url: "https://mirror.test/Papi.zip" });

    expect(stub.calls[0]!.url).toBe("https://mirror.test/Papi.zip");
    expect(stub.calls[0]!.url).not.toBe(PAPI_URL);
  });

  test("returns the archive bytes and the cache validators", async () => {
    const stub = stubFetch(zipResponse());
    const result = await fetchPapiArchive({ fetch: stub.fetch });

    expect(result.notModified).toBe(false);
    expect(result.etag).toBe('"abc123"');
    expect(result.lastModified).toBe("Fri, 21 Aug 2026 09:13:00 GMT");
    if (!result.notModified) expect(result.data).toEqual(zip);
  });

  test("sends the validators it was given", async () => {
    const stub = stubFetch(zipResponse());
    await fetchPapiArchive({
      fetch: stub.fetch,
      etag: '"abc123"',
      lastModified: "Fri, 21 Aug 2026 09:13:00 GMT",
    });

    expect(stub.calls[0]!.headers["if-none-match"]).toBe('"abc123"');
    expect(stub.calls[0]!.headers["if-modified-since"]).toBe("Fri, 21 Aug 2026 09:13:00 GMT");
  });

  test("sends no conditional header when it has nothing to compare", async () => {
    const stub = stubFetch(zipResponse());
    await fetchPapiArchive({ fetch: stub.fetch });

    expect(stub.calls[0]!.headers["if-none-match"]).toBeUndefined();
    expect(stub.calls[0]!.headers["if-modified-since"]).toBeUndefined();
  });

  test("a 304 carries no bytes", async () => {
    const stub = stubFetch(new Response(null, { status: 304, headers: { etag: '"abc123"' } }));
    const result = await fetchPapiArchive({ fetch: stub.fetch, etag: '"abc123"' });

    expect(result.notModified).toBe(true);
    expect(result).not.toHaveProperty("data");
  });

  test("names the URL and the status when the server refuses", async () => {
    const stub = stubFetch(new Response("nope", { status: 503, statusText: "Service Unavailable" }));

    // `.rejects` returns a promise. Unawaited, the test ends before the
    // assertion runs and passes whatever the code does.
    await expect(fetchPapiArchive({ fetch: stub.fetch })).rejects.toThrow(/503/);
    await expect(fetchPapiArchive({ fetch: stub.fetch })).rejects.toThrow(/echecs\.asso\.fr/);
  });

  test("a 404 is an error, not an archive of an HTML error page", async () => {
    const stub = stubFetch(new Response("<html>gone</html>", { status: 404 }));

    await expect(fetchPapiArchive({ fetch: stub.fetch })).rejects.toThrow(/404/);
    await expect(downloadPapi({ fetch: stub.fetch })).rejects.toThrow(/404/);
  });

  test("passes the abort signal down to fetch", async () => {
    // Aborting a request to a dead port proves nothing — the connection fails
    // either way. What matters is that the signal reaches fetch at all.
    const controller = new AbortController();
    const seen: { signal?: AbortSignal | null } = {};

    const spy = (async (_url: string | URL | Request, init?: RequestInit) => {
      seen.signal = init?.signal;
      return zipResponse();
    }) as unknown as typeof globalThis.fetch;

    await fetchPapiArchive({ fetch: spy, signal: controller.signal });

    expect(seen.signal).toBe(controller.signal);
  });

  test("an aborted signal rejects rather than returning a partial archive", async () => {
    const controller = new AbortController();
    controller.abort();

    const spy = (async (_url: string | URL | Request, init?: RequestInit) => {
      init?.signal?.throwIfAborted();
      return zipResponse();
    }) as unknown as typeof globalThis.fetch;

    await expect(
      fetchPapiArchive({ fetch: spy, signal: controller.signal }),
    ).rejects.toThrow();
  });
});

describe("downloadPapi", () => {
  test("hands back the extracted database", async () => {
    const stub = stubFetch(zipResponse());
    const result = await downloadPapi({ fetch: stub.fetch });

    expect(result.notModified).toBe(false);
    if (!result.notModified) {
      expect(result.filename).toBe("Data.mdb");
      expect(result.data).toEqual(mdb);
    }
  });

  test("passes the validators through so the next call can be conditional", async () => {
    const stub = stubFetch(zipResponse());
    const result = await downloadPapi({ fetch: stub.fetch });

    expect(result.etag).toBe('"abc123"');
  });

  test("does not extract when nothing changed", async () => {
    const stub = stubFetch(new Response(null, { status: 304 }));
    const result = await downloadPapi({ fetch: stub.fetch, etag: '"abc123"' });

    expect(result.notModified).toBe(true);
  });
});
