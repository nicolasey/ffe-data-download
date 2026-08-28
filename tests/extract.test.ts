import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { zipSync } from "fflate";
import { extractPapi, listEntries } from "../src/extract";

const mdb = new TextEncoder().encode("not really an Access file, but bytes are bytes");

function archive(entries: Record<string, Uint8Array>): Uint8Array {
  return zipSync(entries);
}

describe("extractPapi", () => {
  test("takes the .mdb without being told its name", () => {
    const result = extractPapi(archive({ "Data.mdb": mdb }));

    expect(result.filename).toBe("Data.mdb");
    expect(result.data).toEqual(mdb);
  });

  test("ignores entries that are not the database", () => {
    const result = extractPapi(
      archive({
        "readme.txt": new TextEncoder().encode("hello"),
        "Data.mdb": mdb,
      }),
    );

    expect(result.filename).toBe("Data.mdb");
    expect(result.data).toEqual(mdb);
  });

  test("matches the extension whatever its case", () => {
    expect(extractPapi(archive({ "DATA.MDB": mdb })).filename).toBe("DATA.MDB");
  });

  test("takes the first .mdb when an archive holds several", () => {
    // Archive order decides, and it has to be stable — silently switching to
    // the last entry would swap which database gets imported.
    const first = new TextEncoder().encode("first");
    const second = new TextEncoder().encode("second");
    const result = extractPapi(zipSync({ "Data.mdb": first, "Old.mdb": second }));

    expect(result.filename).toBe("Data.mdb");
    expect(result.data).toEqual(first);
  });

  test("takes a named entry when asked", () => {
    const wanted = new TextEncoder().encode("the other one");
    const zip = archive({ "Data.mdb": mdb, "Archive.mdb": wanted });

    expect(extractPapi(zip, { filename: "Archive.mdb" }).data).toEqual(wanted);
  });

  test("says what the archive holds when there is no database", () => {
    const zip = archive({ "readme.txt": new TextEncoder().encode("hello") });

    // The failure a caller actually hits is the FFE serving an error page or a
    // changed archive — the message has to name what arrived instead.
    expect(() => extractPapi(zip)).toThrow(/readme\.txt/);
    expect(() => extractPapi(zip)).toThrow(/No \.mdb entry/);
  });

  test("says so when the named entry is absent", () => {
    const zip = archive({ "Data.mdb": mdb });

    expect(() => extractPapi(zip, { filename: "Nope.mdb" })).toThrow(/"Nope\.mdb" not found/);
    expect(() => extractPapi(zip, { filename: "Nope.mdb" })).toThrow(/Data\.mdb/);
  });

  test("rejects bytes that are not a zip", () => {
    expect(() => extractPapi(new Uint8Array([1, 2, 3, 4]))).toThrow();
  });
});

describe("listEntries", () => {
  test("names every entry", () => {
    const zip = archive({ "Data.mdb": mdb, "readme.txt": new TextEncoder().encode("x") });

    expect(listEntries(zip).sort()).toEqual(["Data.mdb", "readme.txt"]);
  });
});

/**
 * Integration test against the real 46 MB FFE archive.
 * Point FFE_ZIP at a copy to run it; it skips without one.
 */
const FFE_ZIP = process.env.FFE_ZIP;

describe.skipIf(FFE_ZIP === undefined || !existsSync(FFE_ZIP))("against the real archive", () => {
  test("extracts Data.mdb", () => {
    const result = extractPapi(readFileSync(FFE_ZIP!));

    expect(result.filename).toBe("Data.mdb");
    // Access files start with a fixed signature; proves we inflated, not copied.
    expect(new TextDecoder().decode(result.data.subarray(4, 19))).toBe("Standard Jet DB");
    expect(result.data.byteLength).toBeGreaterThan(100_000_000);
  });
});
