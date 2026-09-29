// Client de test : envoie de l'audio au serveur et affiche les transcriptions reçues.
//
//   npm run test:ws                   -> envoie du silence en boucle (suffit pour le mock)
//   npm run test:ws -- fichier.wav    -> streame un WAV PCM 16 bits au rythme réel (pour Kyutai)
//
// Variable optionnelle : WS_URL=ws://localhost:3000/ws
import { readFileSync } from "node:fs";
import WebSocket from "ws";
import { wavToPcm16 } from "../src/audio/wav.js";

const SAMPLE_RATE = 24_000;
const CHUNK_MS = 80;
const CHUNK_SAMPLES = (SAMPLE_RATE * CHUNK_MS) / 1000;

const url = process.env.WS_URL ?? "ws://localhost:3000/ws";
const wavPath = process.argv[2];

/** WAV quelconque → PCM s16le mono 24 kHz. */
function loadWav(path: string): Int16Array {
  const pcm = wavToPcm16(readFileSync(path));
  return new Int16Array(pcm.buffer, pcm.byteOffset, pcm.length / 2);
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
