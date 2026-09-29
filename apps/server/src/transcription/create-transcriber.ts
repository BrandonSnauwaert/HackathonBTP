import type { Config } from "../config.js";
import { KyutaiTranscriber, type Logger } from "./kyutai-transcriber.js";
import { MockTranscriber } from "./mock-transcriber.js";
import type { Transcriber } from "./transcriber.js";

/** Instancie le fournisseur de transcription choisi par la variable d'env TRANSCRIBER. */
export function createTranscriber(config: Config, logger: Logger): Transcriber {
  switch (config.TRANSCRIBER) {
    case "mock":
      return new MockTranscriber();
    case "kyutai":
      return new KyutaiTranscriber({
        url: config.KYUTAI_URL,
        apiKey: config.KYUTAI_API_KEY,
        pauseHeadIndex: config.KYUTAI_PAUSE_HEAD,
        pauseThreshold: config.KYUTAI_PAUSE_THRESHOLD,
        logger,
      });
  }
}
