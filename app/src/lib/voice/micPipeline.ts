import { audioContext, getUserMedia, whenAudioRunning } from '../webrtc';

const SPEAKING_LEVEL = 10; // average frequency magnitude (0-255) that counts as talking
const SPEAKING_CHECK_MS = 100;

/**
 * Your microphone on its way to the others: the raw mic, and (web) a volume stage with a limiter
 * in front of it so 150% doesn't clip, plus "is speaking" detection.
 *
 * Peers get the raw mic at first. The Web Audio graph only produces sound once its shared context
 * is running, which can take a moment after the click that joined voice; until then the processed
 * track would be silence. `onProcessed` hands over the processed stream once it's live.
 */
export class MicPipeline {
  private nodes: any[] = [];
  private gain: any = null;
  private speakingTimer: ReturnType<typeof setInterval> | null = null;
  private closed = false;
  /** What the others should receive right now */
  out: any;

  private constructor(readonly raw: any) {
    this.out = raw;
  }

  /** Open the microphone (`deviceId` if one was picked). Throws if there's no mic or no permission. */
  static async open(deviceId: string, volume: number, on: {
    processed: (stream: any) => void;
    speaking: (speaking: boolean) => void;
  }): Promise<MicPipeline> {
    const stream = await getUserMedia({ audio: deviceId ? { deviceId: { ideal: deviceId } } : true, video: false });
    if (!stream) throw new Error('no microphone stream');
    const mic = new MicPipeline(stream);
    mic.buildGraph(volume, on);
    return mic;
  }

  /** True once the volume stage is what's being sent (web, after the audio context starts) */
  get adjustable() {
    return this.out !== this.raw;
  }

  private buildGraph(volume: number, on: { processed: (stream: any) => void; speaking: (speaking: boolean) => void }) {
    const ctx: any = audioContext();
    if (!ctx?.createMediaStreamDestination) return; // native: no Web Audio, the raw mic is sent
    try {
      const source = ctx.createMediaStreamSource(this.raw);
      const gain = ctx.createGain();
      gain.gain.value = volume / 100;
      // A mic boosted past 100% would clip for everyone: limit just under full scale
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -1;
      limiter.knee.value = 0;
      limiter.ratio.value = 20;
      limiter.attack.value = 0.002;
      limiter.release.value = 0.1;
      const destination = ctx.createMediaStreamDestination();
      source.connect(gain);
      gain.connect(limiter);
      limiter.connect(destination);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      this.gain = gain;
      this.nodes = [source, gain, limiter, analyser];

      whenAudioRunning(() => {
        if (this.closed) return;
        const processed = destination.stream;
        const track = processed.getAudioTracks()[0];
        // Keep the mute state across the switch
        if (track) track.enabled = this.raw.getAudioTracks()[0]?.enabled ?? true;
        this.out = processed;
        on.processed(processed);
      });

      // Speaking detection listens to the raw mic (so it follows mute, not volume)
      const levels = new Uint8Array(analyser.frequencyBinCount);
      let speaking = false;
      this.speakingTimer = setInterval(() => {
        analyser.getByteFrequencyData(levels);
        const average = levels.reduce((sum: number, v: number) => sum + v, 0) / levels.length;
        if ((average > SPEAKING_LEVEL) !== speaking) {
          speaking = !speaking;
          on.speaking(speaking);
        }
      }, SPEAKING_CHECK_MS);
    } catch {
      this.nodes = [];
      this.gain = null;
    }
  }

  setVolume(volume: number) {
    if (this.gain) this.gain.gain.value = volume / 100;
  }

  /** Mute both the raw mic (speaking detection, the volume stage's input) and what's sent */
  setMuted(muted: boolean) {
    for (const stream of new Set([this.raw, this.out])) {
      stream?.getAudioTracks().forEach((track: any) => { track.enabled = !muted; });
    }
  }

  close() {
    this.closed = true;
    if (this.speakingTimer) clearInterval(this.speakingTimer);
    for (const node of this.nodes) { try { node.disconnect(); } catch { /* already gone */ } }
    this.nodes = [];
    for (const stream of new Set([this.out, this.raw])) stream?.getTracks().forEach((track: any) => track.stop());
  }
}
