import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectImageType } from "./image-type.js";

describe("detectImageType", () => {
  it("reconnaît JPEG, PNG et WebP à leur signature", () => {
    assert.equal(detectImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0])), "image/jpeg");
    assert.equal(detectImageType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])), "image/png");
    assert.equal(detectImageType(Buffer.from("RIFF\0\0\0\0WEBPVP8 ", "latin1")), "image/webp");
  });

  it("refuse le reste, même avec une extension ou un type trompeur", () => {
    assert.equal(detectImageType(Buffer.from("GIF89a")), null);
    assert.equal(detectImageType(Buffer.from("<svg xmlns=...>")), null);
    assert.equal(detectImageType(Buffer.from("RIFF\0\0\0\0WAVEfmt ", "latin1")), null, "un WAV n'est pas une image");
    assert.equal(detectImageType(Buffer.alloc(0)), null);
  });
});
