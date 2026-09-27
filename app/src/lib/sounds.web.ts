function tone(ctx: AudioContext, freq: number, start: number, dur: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.15, start);
  gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
  osc.start(start);
  osc.stop(start + dur);
}

export function playNotifSound() {
  try {
    const ctx = new AudioContext();
    tone(ctx, 660, ctx.currentTime, 0.12);
    tone(ctx, 880, ctx.currentTime + 0.1, 0.18);
  } catch {}
}

export function playVoiceJoinSound() {
  try {
    const ctx = new AudioContext();
    tone(ctx, 440, ctx.currentTime, 0.15);
    tone(ctx, 880, ctx.currentTime + 0.13, 0.22);
  } catch {}
}

export function playVoiceLeaveSound() {
  try {
    const ctx = new AudioContext();
    tone(ctx, 880, ctx.currentTime, 0.15);
    tone(ctx, 440, ctx.currentTime + 0.13, 0.22);
  } catch {}
}
