export interface AudioChunk {
  /** PCM s16le mono 24 kHz, 80 ms */
  pcm: ArrayBuffer;
  /** Niveau RMS du bloc, entre 0 et 1 */
  rms: number;
}

export interface Recorder {
  stop(): Promise<void>;
}

/** Démarre la capture micro et appelle `onChunk` toutes les 80 ms. */
export async function startRecorder(onChunk: (chunk: AudioChunk) => void): Promise<Recorder> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });

  const context = new AudioContext();
  try {
    await context.audioWorklet.addModule("/pcm-recorder-worklet.js");
    const source = context.createMediaStreamSource(stream);
    const worklet = new AudioWorkletNode(context, "pcm-recorder");
    worklet.port.onmessage = (event: MessageEvent<AudioChunk>) => onChunk(event.data);
    source.connect(worklet);

    return {
      async stop() {
        worklet.port.onmessage = null;
        source.disconnect();
        worklet.disconnect();
        for (const track of stream.getTracks()) track.stop();
        await context.close();
      },
    };
  } catch (err) {
    for (const track of stream.getTracks()) track.stop();
    await context.close();
    throw err;
  }
}
