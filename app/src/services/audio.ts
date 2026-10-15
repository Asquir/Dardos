// Audio 100% procedural con Web Audio: efectos, público, música de menú y locutor (voz sintetizada).

type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

class AudioEngine {
  ctx: AudioContext | null = null;
  master!: GainNode;
  sfx!: GainNode;
  music!: GainNode;
  amb!: GainNode;
  private noise!: AudioBuffer;
  private musicTimer: ReturnType<typeof setInterval> | null = null;
  private musicStep = 0;
  private nextNoteTime = 0;
  private ambSrc: AudioBufferSourceNode | null = null;
  sfxVol = 0.9;
  musicVol = 0.5;
  voice = true;
  lang: 'es' | 'en' = 'es';
  private wantMusic = false;
  private ambLevel = 0;

  /** Debe llamarse dentro de un gesto del usuario (requisito de iOS/Android). */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.ratio.value = 3;
    comp.connect(this.master);
    this.sfx = this.ctx.createGain();
    this.music = this.ctx.createGain();
    this.amb = this.ctx.createGain();
    this.sfx.connect(comp);
    this.music.connect(comp);
    this.amb.connect(comp);
    this.sfx.gain.value = this.sfxVol;
    this.music.gain.value = this.musicVol * 0.35;
    this.amb.gain.value = 0;
    const len = this.ctx.sampleRate * 2;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    if (this.wantMusic) this.startMusic();
    if (this.ambLevel > 0) this.setAmbience(this.ambLevel);
  }

  setVolumes(sfx: number, music: number) {
    this.sfxVol = sfx;
    this.musicVol = music;
    if (!this.ctx) return;
    this.sfx.gain.value = sfx;
    this.music.gain.value = music * 0.35;
  }

  suspend() {
    void this.ctx?.suspend();
  }
  resume() {
    void this.ctx?.resume();
  }

  // ------------------------------------------------------------ utilidades
  private t() {
    return this.ctx!.currentTime;
  }
  private env(g: GainNode, t0: number, a: number, peak: number, d: number) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
  }
  private tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.3, at = 0, dest: AudioNode = this.sfx, glide?: number) {
    if (!this.ctx) return;
    const t0 = this.t() + at;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (glide) o.frequency.exponentialRampToValueAtTime(glide, t0 + dur);
    this.env(g, t0, 0.005, vol, dur);
    o.connect(g).connect(dest);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }
  private noiseBurst(dur: number, filter: BiquadFilterType, freq: number, q: number, vol: number, at = 0, dest: AudioNode = this.sfx, sweepTo?: number) {
    if (!this.ctx) return;
    const t0 = this.t() + at;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = this.ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.setValueAtTime(freq, t0);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t0 + dur);
    f.Q.value = q;
    const g = this.ctx.createGain();
    this.env(g, t0, Math.min(0.01, dur / 4), vol, dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t0, Math.random() * 1.5);
    src.stop(t0 + dur + 0.05);
  }

  // ------------------------------------------------------------ efectos de juego
  whoosh() {
    this.noiseBurst(0.22, 'bandpass', 500, 1.2, 0.25, 0, this.sfx, 2600);
  }
  thud(strength = 1) {
    if (!this.ctx) return;
    this.noiseBurst(0.012, 'highpass', 3500, 0.7, 0.35 * strength);
    this.tone(150, 0.11, 'sine', 0.55 * strength, 0, this.sfx, 55);
    this.noiseBurst(0.06, 'bandpass', 1100, 1.4, 0.3 * strength);
  }
  clank() {
    for (const f of [1240, 2730, 3910, 5230]) this.tone(f * (0.98 + Math.random() * 0.04), 0.35, 'sine', 0.08, 0);
    this.noiseBurst(0.02, 'highpass', 5000, 1, 0.2);
  }
  wallHit() {
    this.tone(95, 0.15, 'sine', 0.4, 0, this.sfx, 50);
    this.noiseBurst(0.08, 'lowpass', 900, 0.7, 0.3);
  }
  click() {
    this.tone(880, 0.04, 'sine', 0.15);
    this.tone(1320, 0.03, 'triangle', 0.05, 0.005);
  }
  pop() {
    this.tone(420, 0.09, 'sine', 0.25, 0, this.sfx, 900);
  }
  coin() {
    this.tone(1318, 0.12, 'square', 0.05);
    this.tone(1760, 0.25, 'square', 0.05, 0.06);
    this.tone(2637, 0.3, 'sine', 0.06, 0.06);
  }
  gem() {
    [2093, 2637, 3136, 4186].forEach((f, i) => this.tone(f, 0.25, 'sine', 0.07, i * 0.04));
  }
  tick() {
    this.tone(1800, 0.02, 'square', 0.04);
  }
  bust() {
    this.tone(330, 0.25, 'sawtooth', 0.12, 0, this.sfx, 220);
    this.tone(247, 0.45, 'sawtooth', 0.12, 0.25, this.sfx, 150);
  }
  score(points: number) {
    // pequeño "ding" cuyo tono sube con la puntuación del dardo
    const f = 520 + Math.min(60, points) * 14;
    this.tone(f, 0.18, 'triangle', 0.06, 0.02);
  }
  treble() {
    [880, 1109, 1319].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.08, i * 0.05));
  }
  bull() {
    [659, 988, 1319, 1976].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.08, i * 0.06));
    this.cheer(0.4);
  }

  /** Público: murmullo que crece + aplausos. */
  cheer(intensity = 1) {
    if (!this.ctx) return;
    const dur = 1.2 + intensity * 1.6;
    // voces (ruido con formantes)
    for (const [f, q] of [[600, 2], [1200, 3], [2400, 4]] as const) {
      const t0 = this.t();
      const src = this.ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f;
      bp.Q.value = q;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.18 * intensity, t0 + 0.25);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(bp).connect(g).connect(this.sfx);
      src.start(t0);
      src.stop(t0 + dur + 0.1);
    }
    this.applause(dur, intensity);
  }
  applause(dur = 2, intensity = 1) {
    if (!this.ctx) return;
    const n = Math.round(dur * 70 * intensity);
    for (let i = 0; i < n; i++) {
      const at = Math.random() * dur * (Math.random() < 0.7 ? 0.7 : 1);
      this.noiseBurst(0.015 + Math.random() * 0.01, 'bandpass', 1500 + Math.random() * 2500, 1.5, 0.05 + Math.random() * 0.07 * intensity, at);
    }
  }
  oneEighty() {
    this.cheer(1.4);
    [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.5, 'sawtooth', 0.05, 0.1 + i * 0.07));
    this.say(this.lang === 'es' ? '¡Ciento ochenta!' : 'One hundred and eighty!', true);
  }

  // ------------------------------------------------------------ interfaz y recompensas
  chestShake() {
    this.tone(120 + Math.random() * 40, 0.08, 'sine', 0.35, 0, this.sfx, 70);
    this.noiseBurst(0.05, 'lowpass', 700, 0.8, 0.25);
  }
  chestOpen() {
    this.noiseBurst(0.6, 'bandpass', 400, 0.8, 0.3, 0, this.sfx, 5000);
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.6, 'triangle', 0.1, 0.1 + i * 0.06));
    [2093, 2637, 3136].forEach((f, i) => this.tone(f, 0.8, 'sine', 0.04, 0.35 + i * 0.05));
  }
  card(r: Rarity) {
    const base = { common: 660, rare: 784, epic: 880, legendary: 1047 }[r];
    this.noiseBurst(0.12, 'highpass', 2000, 0.6, 0.12);
    [1, 1.25, 1.5].forEach((m, i) => this.tone(base * m, 0.3, 'triangle', 0.08, 0.03 + i * 0.05));
    if (r === 'epic' || r === 'legendary') {
      [2, 2.5, 3, 4].forEach((m, i) => this.tone(base * m, 0.6, 'sine', 0.05, 0.2 + i * 0.07));
      if (r === 'legendary') this.cheer(0.6);
    }
  }
  levelUp() {
    const notes = [523, 659, 784, 1047, 784, 1047, 1319];
    notes.forEach((f, i) => this.tone(f, 0.22, 'square', 0.05, i * 0.09));
    notes.forEach((f, i) => this.tone(f / 2, 0.22, 'triangle', 0.08, i * 0.09));
  }
  win() {
    [392, 523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.35, 'square', 0.05, i * 0.12));
    [196, 262, 330, 392, 523].forEach((f, i) => this.tone(f, 0.4, 'triangle', 0.1, i * 0.12));
    this.cheer(1);
  }
  lose() {
    [392, 349, 311, 262].forEach((f, i) => this.tone(f, 0.4, 'triangle', 0.1, i * 0.2));
  }
  whooshUi() {
    this.noiseBurst(0.18, 'bandpass', 1500, 0.9, 0.08, 0, this.sfx, 4000);
  }
  error() {
    this.tone(220, 0.15, 'square', 0.06);
    this.tone(196, 0.2, 'square', 0.06, 0.12);
  }

  // ------------------------------------------------------------ ambiente
  setAmbience(level: number) {
    this.ambLevel = level;
    if (!this.ctx) return;
    if (!this.ambSrc && level > 0) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'bandpass';
      lp.frequency.value = 450;
      lp.Q.value = 0.6;
      const lfo = this.ctx.createOscillator();
      const lfoG = this.ctx.createGain();
      lfo.frequency.value = 0.15;
      lfoG.gain.value = 120;
      lfo.connect(lfoG).connect(lp.frequency);
      lfo.start();
      src.connect(lp).connect(this.amb);
      src.start();
      this.ambSrc = src;
    }
    this.amb.gain.setTargetAtTime(level * 0.07 * this.sfxVol, this.t(), 0.5);
  }

  // ------------------------------------------------------------ música
  startMusic() {
    this.wantMusic = true;
    if (!this.ctx || this.musicTimer) return;
    this.nextNoteTime = this.t() + 0.1;
    this.musicTimer = setInterval(() => this.schedule(), 50);
  }
  stopMusic() {
    this.wantMusic = false;
    if (this.musicTimer) clearInterval(this.musicTimer);
    this.musicTimer = null;
  }
  private schedule() {
    if (!this.ctx) return;
    const bpm = 98;
    const step = 60 / bpm / 2; // corcheas
    // progresión I - V - vi - IV en Do (estilo pop desenfadado)
    const chords = [
      [261.6, 329.6, 392.0],
      [196.0, 246.9, 293.7],
      [220.0, 261.6, 329.6],
      [174.6, 220.0, 261.6],
    ];
    const melody = [0, 2, 4, 2, 5, 4, 2, 0, 4, 5, 7, 5, 4, 2, 4, 2];
    const scale = [523.3, 587.3, 659.3, 698.5, 784.0, 880.0, 987.8, 1046.5];
    while (this.nextNoteTime < this.t() + 0.2) {
      const s = this.musicStep % 64;
      const bar = Math.floor(s / 16) % 4;
      const ch = chords[bar];
      const at = this.nextNoteTime - this.t();
      if (s % 16 === 0) for (const f of ch) this.tone(f, step * 15, 'triangle', 0.035, at, this.music);
      if (s % 4 === 0) this.tone(ch[0] / 2, step * 1.6, 'sine', 0.16, at, this.music);
      if (s % 4 === 0) this.tone(90, 0.12, 'sine', 0.2, at, this.music, 45); // bombo
      if (s % 2 === 1) this.noiseBurst(0.03, 'highpass', 7000, 0.7, 0.03, at, this.music); // charles
      if (s % 8 === 4) this.noiseBurst(0.09, 'bandpass', 1800, 0.8, 0.06, at, this.music); // caja
      if (s % 2 === 0 && Math.floor(s / 32) === 1) {
        const n = melody[(s / 2) % melody.length];
        this.tone(scale[n], step * 1.8, 'square', 0.018, at, this.music);
      }
      this.musicStep++;
      this.nextNoteTime += step;
    }
  }

  // ------------------------------------------------------------ locutor
  say(text: string, excited = false) {
    if (!this.voice || typeof speechSynthesis === 'undefined') return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = this.lang === 'es' ? 'es-ES' : 'en-GB';
      u.rate = excited ? 0.9 : 1;
      u.pitch = excited ? 0.75 : 0.85;
      u.volume = Math.min(1, this.sfxVol + 0.1);
      const voices = speechSynthesis.getVoices();
      const v = voices.find((x) => x.lang.startsWith(u.lang.slice(0, 2)) && /male|jorge|diego|daniel|carlos/i.test(x.name)) ?? voices.find((x) => x.lang.startsWith(u.lang.slice(0, 2)));
      if (v) u.voice = v;
      speechSynthesis.speak(u);
    } catch {
      /* sin voz disponible */
    }
  }
  callScore(total: number) {
    if (this.lang === 'es') {
      if (total === 0) this.say('Nada');
      else this.say(String(total), total >= 100);
    } else this.say(total === 0 ? 'No score' : String(total), total >= 100);
  }
}

export const audio = new AudioEngine();
