/** Assemble des blocs PCM s16le mono en un fichier WAV (format attendu par POST /clips). */
export function encodeWav(chunks: readonly ArrayBuffer[], sampleRate: number): Blob {
  const dataLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const header = new DataView(new ArrayBuffer(44));
  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) header.setUint8(offset + i, text.charCodeAt(i));
  };

  writeAscii(0, "RIFF");
  header.setUint32(4, 36 + dataLength, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  header.setUint32(16, 16, true); // taille du bloc fmt
  header.setUint16(20, 1, true); // PCM
  header.setUint16(22, 1, true); // mono
  header.setUint32(24, sampleRate, true);
  header.setUint32(28, sampleRate * 2, true); // octets par seconde
  header.setUint16(32, 2, true); // octets par échantillon
  header.setUint16(34, 16, true); // bits par échantillon
  writeAscii(36, "data");
  header.setUint32(40, dataLength, true);

  return new Blob([header.buffer, ...chunks], { type: "audio/wav" });
}
