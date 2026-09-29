import "dotenv/config";
import Fastify from "fastify";
import websocket from "@fastify/websocket";
import type { RawData } from "ws";
import { config } from "./config.js";
import { createTranscriber } from "./create-transcriber.js";

function toBuffer(data: RawData): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (Array.isArray(data)) return Buffer.concat(data);
  return Buffer.from(data);
}

const app = Fastify({ logger: true });
await app.register(websocket);

app.get("/health", async () => ({ status: "ok" }));

app.get("/ws", { websocket: true }, (socket, request) => {
  request.log.info({ transcriber: config.TRANSCRIBER }, "client WebSocket connecté");
  const transcriber = createTranscriber(config, request.log);

  transcriber.onTranscript(({ text, isFinal }) => {
    if (socket.readyState !== socket.OPEN) return;
    socket.send(JSON.stringify({ type: "transcript", text, isFinal }));
  });

  socket.on("message", (data: RawData, isBinary: boolean) => {
    if (!isBinary) {
      request.log.debug({ message: data.toString() }, "message texte ignoré");
      return;
    }
    transcriber.sendAudio(toBuffer(data));
  });

  socket.on("close", () => {
    transcriber.close();
    request.log.info("client WebSocket déconnecté");
  });

  socket.on("error", (err) => {
    request.log.error(err, "erreur WebSocket");
    transcriber.close();
  });
});

try {
  await app.listen({ port: config.PORT, host: config.HOST });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
