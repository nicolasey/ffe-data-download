/** Where the FFE publishes the national PAPI export. */
export const PAPI_URL = "https://www.echecs.asso.fr/Papi/PapiData.zip";

export type FetchOptions = {
  /** Override the source URL. Defaults to {@link PAPI_URL}. */
  url?: string;
  /** Abort the request. Pass `AbortSignal.timeout(ms)` to bound it. */
  signal?: AbortSignal;
  /**
   * ETag from a previous download. When the file has not changed, the server
   * answers 304 and nothing is transferred.
   */
  etag?: string;
  /** `Last-Modified` from a previous download. Same purpose as `etag`. */
  lastModified?: string;
  /** Supply your own fetch. Defaults to the global one. */
  fetch?: typeof globalThis.fetch;
};

/** Validators to hand back on the next call so an unchanged file is not re-sent. */
export type CacheValidators = {
  etag: string | null;
  lastModified: string | null;
};

export type PapiArchive = CacheValidators & {
  notModified: false;
  /** The raw `.zip` bytes. */
  data: Uint8Array;
};

export type PapiDatabase = CacheValidators & {
  notModified: false;
  /** The extracted `.mdb` bytes, ready for `@nicolasey/chess-papi`. */
  data: Uint8Array;
  /** Entry name the bytes came from, e.g. `"Data.mdb"`. */
  filename: string;
};

/** Returned when the server confirms nothing changed. Carries no bytes. */
export type NotModified = CacheValidators & {
  notModified: true;
};

export type ExtractOptions = {
  /**
   * Which entry to take. Defaults to the first `.mdb` in the archive, which is
   * what the FFE ships.
   */
  filename?: string;
};
