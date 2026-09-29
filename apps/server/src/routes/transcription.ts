import type { FastifyPluginAsync } from "fastify";
import type { RawData } from "ws";
import type { Config } from "../config.js";
import { createTranscriber } from "../create-transcriber.js";

function toBuffer(data: RawData): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (Array.isArray(data)) return Buffer.concat(data);
  return Buffer.from(data);
}

/**
 * WebSocket de transcription en direct : le client envoie du PCM s16le mono 24 kHz
 * en binaire, le serveur répond { type: "transcript", text, isFinal }.
 */
export const transcriptionRoutes: FastifyPluginAsync<{ config: Config }> = async (app, { config }) => {
  app.get("/ws", { websocket: true, schema: { hide: true } }, (socket, request) => {
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
};
