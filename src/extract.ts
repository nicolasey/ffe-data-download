import { unzipSync } from "fflate";
import type { ExtractOptions, PapiDatabase } from "./types.js";

/** Names of the entries in a zip, without inflating any of them. */
export function listEntries(archive: Uint8Array): string[] {
  // fflate's filter runs per entry and decides whether to inflate it; returning
  // false everywhere walks the directory without spending CPU on the payload.
  const names: string[] = [];
  unzipSync(archive, {
    filter: (file) => {
      names.push(file.name);
      return false;
    },
  });
  return names;
}

/**
 * Pull the Access database out of a PAPI archive.
 *
 * Pure — no network, no filesystem. Split out from {@link downloadPapi} so a
 * cached archive can be re-extracted without going back to the FFE.
 *
 * The FFE archive holds a single ~154 MB `Data.mdb`. The result is that whole
 * file in memory, because `mdb-reader` needs random access to it.
 */
export function extractPapi(
  archive: Uint8Array,
  options: ExtractOptions = {},
): { data: Uint8Array; filename: string } {
  const wanted = options.filename;

  let picked: string | null = null;
  const files = unzipSync(archive, {
    filter: (file) => {
      if (picked !== null) return false;
      const match = wanted !== undefined
        ? file.name === wanted
        : file.name.toLowerCase().endsWith(".mdb");
      if (match) picked = file.name;
      return match;
    },
  });

  if (picked === null) {
    const found = listEntries(archive);
    throw new Error(
      wanted !== undefined
        ? `Entry "${wanted}" not found. This archive holds: ${found.join(", ") || "nothing"}.`
        : `No .mdb entry in this archive. It holds: ${found.join(", ") || "nothing"}. Is it the PAPI archive?`,
    );
  }

  return { data: files[picked]!, filename: picked };
}

/** Attach the extracted database to the validators a download returned. */
export function withDatabase(
  archive: Uint8Array,
  validators: { etag: string | null; lastModified: string | null },
  options?: ExtractOptions,
): PapiDatabase {
  const { data, filename } = extractPapi(archive, options);
  return { ...validators, notModified: false, data, filename };
}
