import { withDatabase } from "./extract";
import {
  PAPI_URL,
  type ExtractOptions,
  type FetchOptions,
  type NotModified,
  type PapiArchive,
  type PapiDatabase,
} from "./types";

function conditionalHeaders(options: FetchOptions): Record<string, string> {
  const headers: Record<string, string> = {};
  if (options.etag !== undefined) headers["If-None-Match"] = options.etag;
  if (options.lastModified !== undefined) headers["If-Modified-Since"] = options.lastModified;
  return headers;
}

/**
 * Download the PAPI archive.
 *
 * Returns the `.zip` bytes untouched. Use this when you want to keep the
 * archive around — it is 46 MB against 154 MB extracted.
 *
 * Pass `etag` or `lastModified` from a previous call and an unchanged file
 * comes back as `{ notModified: true }` with no body transferred.
 */
export async function fetchPapiArchive(
  options: FetchOptions = {},
): Promise<PapiArchive | NotModified> {
  const doFetch = options.fetch ?? globalThis.fetch;
  if (typeof doFetch !== "function") {
    throw new Error("No fetch available. Pass one as options.fetch.");
  }

  const url = options.url ?? PAPI_URL;
  const response = await doFetch(url, {
    headers: conditionalHeaders(options),
    signal: options.signal,
  });

  const validators = {
    etag: response.headers.get("etag"),
    lastModified: response.headers.get("last-modified"),
  };

  if (response.status === 304) return { ...validators, notModified: true };

  if (!response.ok) {
    throw new Error(`Could not fetch ${url}: ${response.status} ${response.statusText}`);
  }

  return {
    ...validators,
    notModified: false,
    data: new Uint8Array(await response.arrayBuffer()),
  };
}

/**
 * Download the PAPI archive and extract the Access database from it.
 *
 * ```ts
 * const result = await downloadPapi();
 * if (!result.notModified) {
 *   readPlayers(result.data);  // @nicolasey/chess-papi
 * }
 * ```
 *
 * Holds roughly 200 MB at peak — the archive and the extracted database are
 * both in memory while inflating.
 */
export async function downloadPapi(
  options: FetchOptions & ExtractOptions = {},
): Promise<PapiDatabase | NotModified> {
  const archive = await fetchPapiArchive(options);
  if (archive.notModified) return archive;

  return withDatabase(
    archive.data,
    { etag: archive.etag, lastModified: archive.lastModified },
    options,
  );
}
