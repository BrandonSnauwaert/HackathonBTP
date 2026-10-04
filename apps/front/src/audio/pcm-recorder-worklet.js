// AudioWorklet : capte le micro, le ramène en mono 24 kHz, et envoie au thread
// principal des blocs de 80 ms en PCM s16le (format attendu par le serveur).
// Fichier JS (pas de typings TypeScript pour le scope AudioWorklet), intégré au bundle comme texte par
// recorder.ts et chargé depuis un Blob : aucune requête réseau, l'enregistrement marche hors connexion.

const TARGET_RATE = 24000;
const CHUNK_SAMPLES = 1920; // 80 ms à 24 kHz

class PcmRecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // `sampleRate` est la fréquence réelle du contexte audio (souvent 44,1 ou 48 kHz).
    this.step = sampleRate / TARGET_RATE;
    this.position = 0; // position fractionnaire dans le flux d'entrée
    this.previous = 0; // dernier échantillon du bloc précédent, pour l'interpolation
    this.chunk = new Int16Array(CHUNK_SAMPLES);
    this.filled = 0;
    this.sumSquares = 0;
  }

  process(inputs) {
    const channels = inputs[0];
    if (!channels || channels.length === 0) return true;
    const input = channels[0];

    // Rééchantillonnage linéaire vers 24 kHz.
    while (this.position < input.length) {
      const i = Math.floor(this.position);
      const frac = this.position - i;
      const a = i === 0 ? this.previous : input[i - 1];
      const b = input[i];
      const sample = Math.max(-1, Math.min(1, a + (b - a) * frac));

      this.chunk[this.filled++] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      this.sumSquares += sample * sample;

      if (this.filled === CHUNK_SAMPLES) {
        const rms = Math.sqrt(this.sumSquares / CHUNK_SAMPLES);
        const buffer = this.chunk.buffer;
        this.port.postMessage({ pcm: buffer, rms }, [buffer]);
        this.chunk = new Int16Array(CHUNK_SAMPLES);
        this.filled = 0;
        this.sumSquares = 0;
      }
      this.position += this.step;
    }
    this.position -= input.length;
    this.previous = input[input.length - 1];
    return true;
  }
}

registerProcessor("pcm-recorder", PcmRecorderProcessor);
