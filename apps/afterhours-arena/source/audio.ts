export class ArcadeAudio {
  enabled = true;
  private context: AudioContext | null = null;
  unlock() { if (!this.enabled) return; try { this.context ??= new AudioContext(); void this.context.resume().catch(() => {}); } catch { /* Audio remains optional. */ } }
  play(type: string) {
    if (!this.enabled || !this.context || this.context.state !== 'running') return;
    const c = this.context, t = c.currentTime, osc = c.createOscillator(), gain = c.createGain();
    const variation = .92 + Math.random() * .16;
    const pitches: Record<string, number> = { attack: 160, hit: 85, block: 390, jump: 230, land: 65, special: 480, round: 620, ui: 720 };
    const freq = (pitches[type] ?? 200) * variation, length = type === 'special' ? .22 : type === 'round' ? .28 : .09;
    osc.type = type === 'block' || type === 'ui' ? 'square' : 'triangle';
    osc.frequency.setValueAtTime(freq, t); osc.frequency.exponentialRampToValueAtTime(Math.max(25, freq * .3), t + length);
    gain.gain.setValueAtTime(type === 'ui' ? .025 : .07, t); gain.gain.exponentialRampToValueAtTime(.001, t + length);
    osc.connect(gain); gain.connect(c.destination); osc.start(t); osc.stop(t + length);
    if (type === 'hit' || type === 'land') {
      const buffer = c.createBuffer(1, c.sampleRate * .07, c.sampleRate), data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
      const noise = c.createBufferSource(), nGain = c.createGain(); noise.buffer = buffer; nGain.gain.value = .035;
      noise.connect(nGain); nGain.connect(c.destination); noise.start();
    }
  }
}
