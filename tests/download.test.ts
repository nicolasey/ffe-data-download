import { describe, expect, test } from "bun:test";
import { zipSync } from "fflate";
import { downloadPapi, fetchPapiArchive } from "../src/download";
import { PAPI_URL } from "../src/types";

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

    expect(fetchPapiArchive({ fetch: stub.fetch })).rejects.toThrow(/503/);
    expect(fetchPapiArchive({ fetch: stub.fetch })).rejects.toThrow(/echecs\.asso\.fr/);
  });

  test("a 404 is an error, not an archive of an HTML error page", async () => {
    const stub = stubFetch(new Response("<html>gone</html>", { status: 404 }));

    expect(fetchPapiArchive({ fetch: stub.fetch })).rejects.toThrow(/404/);
  });

  test("honours an abort signal", async () => {
    const controller = new AbortController();
    controller.abort();

    expect(
      fetchPapiArchive({ url: "http://127.0.0.1:1/none", signal: controller.signal }),
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
