// Client de test : envoie de l'audio au serveur et affiche les transcriptions reçues.
//
//   npm run test:ws                   -> envoie du silence en boucle (suffit pour le mock)
//   npm run test:ws -- fichier.wav    -> streame un WAV PCM 16 bits au rythme réel (pour Kyutai)
//
// Variable optionnelle : WS_URL=ws://localhost:3000/ws
import { readFileSync } from "node:fs";
import WebSocket from "ws";

const SAMPLE_RATE = 24_000;
const CHUNK_MS = 80;
const CHUNK_SAMPLES = (SAMPLE_RATE * CHUNK_MS) / 1000;

const url = process.env.WS_URL ?? "ws://localhost:3000/ws";
const wavPath = process.argv[2];

/** Lit un WAV PCM 16 bits et le renvoie en s16le mono 24 kHz (downmix + rééchantillonnage linéaire). */
function loadWav(path: string): Int16Array {
  const buf = readFileSync(path);
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error(`${path} n'est pas un fichier WAV`);
  }
  let channels = 0;
  let rate = 0;
  let bits = 0;
  let data: Buffer | undefined;
  for (let offset = 12; offset + 8 <= buf.length; ) {
    const id = buf.toString("ascii", offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    if (id === "fmt ") {
      channels = buf.readUInt16LE(offset + 10);
      rate = buf.readUInt32LE(offset + 12);
      bits = buf.readUInt16LE(offset + 22);
    } else if (id === "data") {
      data = buf.subarray(offset + 8, offset + 8 + size);
    }
    offset += 8 + size + (size % 2);
  }
  if (!data || bits !== 16) throw new Error("seuls les WAV PCM 16 bits sont supportés");

  const frames = Math.floor(data.length / (2 * channels));
  const mono = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let sum = 0;
    for (let c = 0; c < channels; c++) sum += data.readInt16LE((i * channels + c) * 2);
    mono[i] = sum / channels;
  }

  const outLength = Math.floor((frames * SAMPLE_RATE) / rate);
  const out = new Int16Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const pos = (i * rate) / SAMPLE_RATE;
    const i0 = Math.floor(pos);
    const a = mono[i0] ?? 0;
    const b = mono[i0 + 1] ?? a;
    out[i] = Math.round(a + (b - a) * (pos - i0));
  }
  return out;
}

const audio = wavPath ? loadWav(wavPath) : undefined;
// Après le fichier : 3 s de silence pour laisser le modèle finir et détecter la pause.
const tailChunks = (3000 / CHUNK_MS) | 0;

const ws = new WebSocket(url);
let timer: NodeJS.Timeout | undefined;

ws.on("open", () => {
  console.log(
    audio
      ? `connecté à ${url}, envoi de ${wavPath} (${(audio.length / SAMPLE_RATE).toFixed(1)} s)`
      : `connecté à ${url}, envoi de silence toutes les ${CHUNK_MS} ms (Ctrl+C pour arrêter)`,
  );
  let position = 0;
  let tail = 0;
  timer = setInterval(() => {
    if (audio && position < audio.length) {
      const slice = audio.subarray(position, position + CHUNK_SAMPLES);
      ws.send(Buffer.from(slice.buffer, slice.byteOffset, slice.byteLength));
      position += CHUNK_SAMPLES;
      return;
    }
    ws.send(Buffer.alloc(CHUNK_SAMPLES * 2));
    if (audio && ++tail >= tailChunks) ws.close();
  }, CHUNK_MS);
});

ws.on("message", (data) => console.log("<", data.toString()));

ws.on("close", () => {
  clearInterval(timer);
  console.log("connexion fermée");
});

ws.on("error", (err) => console.error("erreur :", err.message));

process.on("SIGINT", () => ws.close());
