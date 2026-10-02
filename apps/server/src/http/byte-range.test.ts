import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseByteRange } from "./byte-range.js";

describe("parseByteRange", () => {
  it("ignore un en-tête absent ou illisible", () => {
    assert.equal(parseByteRange(undefined, 100), null);
    assert.equal(parseByteRange("items=0-1", 100), null);
    assert.equal(parseByteRange("bytes=0-1,5-6", 100), null);
    assert.equal(parseByteRange("bytes=-", 100), null);
  });

  it("lit les trois formes de plage", () => {
    assert.deepEqual(parseByteRange("bytes=0-1", 100), { start: 0, end: 1 });
    assert.deepEqual(parseByteRange("bytes=10-", 100), { start: 10, end: 99 });
    assert.deepEqual(parseByteRange("bytes=-20", 100), { start: 80, end: 99 });
  });

  it("borne la fin au fichier et refuse un début hors du fichier", () => {
    assert.deepEqual(parseByteRange("bytes=50-500", 100), { start: 50, end: 99 });
    assert.deepEqual(parseByteRange("bytes=-500", 100), { start: 0, end: 99 });
    assert.equal(parseByteRange("bytes=100-", 100), "unsatisfiable");
    assert.equal(parseByteRange("bytes=-0", 100), "unsatisfiable");
  });
});
