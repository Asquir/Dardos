// Audio 100% procedural con Web Audio: efectos con reverberación de sala, público con reacciones,
// música de menú por capas y locutor (voz sintetizada). No usa ningún archivo de sonido.

type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
export type Room = 'pub' | 'club' | 'arena';

const ROOMS: Record<Room, { secs: number; decay: number; send: number; tone: number }> = {
  pub: { secs: 1.1, decay: 3.2, send: 0.16, tone: 0.55 },
  club: { secs: 1.7, decay: 2.8, send: 0.2, tone: 0.45 },
  arena: { secs: 2.8, decay: 2.3, send: 0.26, tone: 0.35 },
};

class AudioEngine {
  ctx: AudioContext | null = null;
  master!: GainNode;
  sfx!: GainNode;
  uiBus!: GainNode;
  music!: GainNode;
  amb!: GainNode;
  private verb!: ConvolverNode;
  private verbSend!: GainNode;
  private musicSend!: GainNode;
  private noise!: AudioBuffer;
  private pink!: AudioBuffer;
  private musicTimer: ReturnType<typeof setInterval> | null = null;
  private musicStep = 0;
  private nextNoteTime = 0;
  private padBus: GainNode | null = null;
  private ambNodes: AudioNode[] = [];
  private ambTimer: ReturnType<typeof setTimeout> | null = null;
  private room: Room = 'pub';
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
    const ctx = new AC({ latencyHint: 'interactive' });
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    // compresor de bus + limitador suave
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 8;
    comp.ratio.value = 3.5;
    comp.attack.value = 0.004;
    comp.release.value = 0.18;
    const limit = ctx.createDynamicsCompressor();
    limit.threshold.value = -2;
    limit.knee.value = 0;
    limit.ratio.value = 20;
    limit.attack.value = 0.001;
    limit.release.value = 0.08;
    comp.connect(limit).connect(this.master);

    this.sfx = ctx.createGain();
    this.uiBus = ctx.createGain();
    this.music = ctx.createGain();
    this.amb = ctx.createGain();
    this.sfx.connect(comp);
    this.uiBus.connect(comp);
    this.music.connect(comp);
    this.amb.connect(comp);

    // reverberación de sala (respuesta al impulso generada)
    this.verb = ctx.createConvolver();
    this.verbSend = ctx.createGain();
    this.musicSend = ctx.createGain();
    const verbOut = ctx.createGain();
    verbOut.gain.value = 0.9;
    this.sfx.connect(this.verbSend);
    this.amb.connect(this.verbSend);
    this.music.connect(this.musicSend);
    this.musicSend.gain.value = 0.18;
    this.verbSend.connect(this.verb);
    this.musicSend.connect(this.verb);
    this.verb.connect(verbOut).connect(comp);
    this.setRoom(this.room);

    this.sfx.gain.value = this.sfxVol;
    this.uiBus.gain.value = this.sfxVol * 0.85;
    this.music.gain.value = this.musicVol * 0.32;
    this.amb.gain.value = 0;

    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // ruido rosa (más natural para el público)
    this.pink = ctx.createBuffer(1, len, ctx.sampleRate);
    const pk = this.pink.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      pk[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
    if (this.wantMusic) this.startMusic();
    if (this.ambLevel > 0) this.setAmbience(this.ambLevel);
  }

  setVolumes(sfx: number, music: number) {
    this.sfxVol = sfx;
    this.musicVol = music;
    if (!this.ctx) return;
    this.sfx.gain.value = sfx;
    this.uiBus.gain.value = sfx * 0.85;
    this.music.gain.value = music * 0.32;
    if (this.ambLevel) this.amb.gain.setTargetAtTime(this.ambLevel * 0.11 * sfx, this.t(), 0.3);
  }

  /** Acústica del local: pub pequeño, club o gran arena. */
  setRoom(room: Room) {
    this.room = room;
    if (!this.ctx) return;
    const r = ROOMS[room];
    this.verb.buffer = this.makeIR(r.secs, r.decay, r.tone);
    this.verbSend.gain.setTargetAtTime(r.send, this.t(), 0.1);
  }

  private makeIR(secs: number, decay: number, tone: number): AudioBuffer {
    const ctx = this.ctx!;
    const rate = ctx.sampleRate;
    const len = Math.floor(rate * secs);
    const buf = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const x = i / len;
        // la cola se oscurece con el tiempo (absorción del aire y las paredes)
        const a = Math.max(0.04, tone * (1 - x * 0.85));
        lp += (Math.random() * 2 - 1 - lp) * a;
        data[i] = lp * Math.pow(1 - x, decay) * (x < 0.004 ? x / 0.004 : 1);
      }
      // primeras reflexiones (paredes, barra, techo)
      const refl = [0.011, 0.017, 0.023, 0.031, 0.043, 0.057];
      refl.forEach((tt, k) => {
        const idx = Math.floor((tt + (ch ? 0.0023 : 0)) * rate * (secs / 1.4));
        if (idx < len) data[idx] += (ch ? -1 : 1) * (0.55 - k * 0.07);
      });
    }
    return buf;
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
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
  }
  private pan(dest: AudioNode, p: number): AudioNode {
    if (!this.ctx || !p || !this.ctx.createStereoPanner) return dest;
    const sp = this.ctx.createStereoPanner();
    sp.pan.value = Math.max(-1, Math.min(1, p));
    sp.connect(dest);
    return sp;
  }
  private tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.3, at = 0, dest: AudioNode = this.sfx, glide?: number, attack = 0.005) {
    if (!this.ctx) return;
    const t0 = this.t() + at;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (glide) o.frequency.exponentialRampToValueAtTime(glide, t0 + dur);
    this.env(g, t0, attack, vol, dur);
    o.connect(g).connect(dest);
    o.start(t0);
    o.stop(t0 + attack + dur + 0.05);
  }
  private noiseBurst(dur: number, filter: BiquadFilterType, freq: number, q: number, vol: number, at = 0, dest: AudioNode = this.sfx, sweepTo?: number, attack?: number, pink = false) {
    if (!this.ctx) return;
    const t0 = this.t() + at;
    const src = this.ctx.createBufferSource();
    src.buffer = pink ? this.pink : this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = this.ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.setValueAtTime(freq, t0);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t0 + dur);
    f.Q.value = q;
    const g = this.ctx.createGain();
    this.env(g, t0, attack ?? Math.min(0.01, dur / 4), vol, dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t0, Math.random() * 1.5);
    src.stop(t0 + dur + 0.05);
  }
  /** Campana/metal: parciales inarmónicos que decaen a ritmos distintos. */
  private bell(freq: number, vol: number, at = 0, dest: AudioNode = this.uiBus, dur = 0.9) {
    const partials: [number, number, number][] = [
      [1, 1, 1],
      [2.0, 0.5, 0.7],
      [2.76, 0.35, 0.5],
      [5.4, 0.18, 0.3],
      [8.93, 0.08, 0.18],
    ];
    for (const [m, a, d] of partials) if (freq * m < 15000) this.tone(freq * m, dur * d, 'sine', vol * a, at, dest, undefined, 0.002);
  }

  // ------------------------------------------------------------ efectos de juego
  whoosh() {
    if (!this.ctx) return;
    const p = (Math.random() - 0.5) * 0.3;
    this.noiseBurst(0.26, 'bandpass', 520, 1.4, 0.22, 0, this.pan(this.sfx, p), 2900, 0.06);
    this.noiseBurst(0.16, 'highpass', 3000, 0.7, 0.06, 0.05, this.sfx, 6000, 0.05);
  }
  thud(strength = 1) {
    if (!this.ctx) return;
    const v = 0.88 + Math.random() * 0.24;
    const s = strength;
    // punta entrando en el sisal
    this.noiseBurst(0.005, 'highpass', 5200, 0.7, 0.5 * s, 0, this.sfx, undefined, 0.0008);
    // golpe seco del sisal ("toc")
    this.noiseBurst(0.06, 'bandpass', 760 * v, 1.3, 0.55 * s, 0.001, this.sfx, 420, 0.001);
    // cuerpo grave de la diana y la pared
    this.tone(128 * v, 0.17, 'sine', 0.62 * s, 0, this.sfx, 46, 0.001);
    this.tone(232 * v, 0.07, 'triangle', 0.14 * s, 0.002, this.sfx, 180, 0.001);
    // vibración de la aleta ("brrr")
    this.flutter(0.24, 0.16 * s, 0.01);
  }
  private flutter(dur: number, vol: number, at = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t0 = this.t() + at;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 520;
    bp.Q.value = 2;
    const am = ctx.createGain();
    am.gain.value = 0;
    const lfo = ctx.createOscillator();
    lfo.frequency.setValueAtTime(46, t0);
    lfo.frequency.exponentialRampToValueAtTime(22, t0 + dur);
    const lfoG = ctx.createGain();
    lfoG.gain.value = 1;
    lfo.connect(lfoG).connect(am.gain);
    const g = ctx.createGain();
    this.env(g, t0, 0.004, vol, dur);
    src.connect(bp).connect(am).connect(g).connect(this.sfx);
    src.start(t0, Math.random());
    lfo.start(t0);
    src.stop(t0 + dur + 0.05);
    lfo.stop(t0 + dur + 0.05);
  }
  clank() {
    for (const f of [1240, 2730, 3910, 5230, 7020]) this.tone(f * (0.97 + Math.random() * 0.06), 0.42, 'sine', 0.07, 0, this.sfx, undefined, 0.001);
    this.noiseBurst(0.02, 'highpass', 5000, 1, 0.24, 0, this.sfx, undefined, 0.001);
    // el dardo cae al suelo
    this.tone(300, 0.05, 'triangle', 0.08, 0.42, this.sfx, 220);
    this.noiseBurst(0.04, 'bandpass', 2200, 2, 0.08, 0.43);
    this.ooh(0.5, 0.15);
  }
  wallHit() {
    this.tone(95, 0.16, 'sine', 0.45, 0, this.sfx, 48, 0.001);
    this.noiseBurst(0.08, 'lowpass', 900, 0.7, 0.32, 0, this.sfx, undefined, 0.001);
    this.flutter(0.18, 0.08, 0.01);
  }
  click() {
    this.tone(1250, 0.035, 'sine', 0.13, 0, this.uiBus, 900, 0.001);
    this.noiseBurst(0.008, 'highpass', 4000, 0.7, 0.06, 0, this.uiBus, undefined, 0.001);
  }
  pop() {
    this.tone(380, 0.1, 'sine', 0.24, 0, this.uiBus, 980, 0.002);
    this.tone(1400, 0.06, 'sine', 0.04, 0.03, this.uiBus);
  }
  coin() {
    this.bell(1975, 0.06, 0, this.uiBus, 0.5);
    this.bell(2637, 0.07, 0.07, this.uiBus, 0.7);
  }
  /** Ráfaga de monedas volando hacia el contador. */
  coinBurst(n = 6, gem = false) {
    for (let i = 0; i < n; i++) {
      const f = (gem ? 2793 : 1975) * Math.pow(1.06, i);
      this.bell(f, 0.035, 0.18 + i * 0.06, this.uiBus, 0.35);
    }
  }
  gem() {
    [2093, 2637, 3136, 4186].forEach((f, i) => this.bell(f, 0.05, i * 0.045, this.uiBus, 0.6));
  }
  tick() {
    this.tone(1800, 0.02, 'square', 0.035, 0, this.uiBus);
  }
  bust() {
    this.tone(330, 0.25, 'sawtooth', 0.1, 0, this.uiBus, 220);
    this.tone(247, 0.45, 'sawtooth', 0.1, 0.25, this.uiBus, 150);
    this.aww(0.8);
  }
  score(points: number) {
    // pequeño "ding" cuyo tono sube con la puntuación del dardo
    const f = 520 + Math.min(60, points) * 14;
    this.tone(f, 0.18, 'triangle', 0.05, 0.02, this.uiBus);
  }
  treble() {
    [880, 1109, 1319].forEach((f, i) => this.tone(f, 0.2, 'triangle', 0.075, i * 0.05, this.uiBus));
    this.sparkle(0.6);
  }
  bull() {
    [659, 988, 1319, 1976].forEach((f, i) => this.tone(f, 0.32, 'triangle', 0.075, i * 0.06, this.uiBus));
    this.sparkle(1);
    this.cheer(0.45);
  }
  /** Combo: arpegio que sube un tono con cada dardo bueno seguido. */
  combo(n: number) {
    const f = 660 * Math.pow(1.122, Math.min(8, n - 2));
    [1, 1.26, 1.5, 2].forEach((m, i) => this.tone(f * m, 0.14, 'triangle', 0.06, i * 0.05, this.uiBus));
    if (n >= 3) this.sparkle(0.5 + Math.min(1, (n - 3) * 0.25));
  }
  /** Chispas eléctricas (triples y bull). */
  sparkle(intensity = 1) {
    const n = Math.round(10 * intensity);
    for (let i = 0; i < n; i++) this.noiseBurst(0.006 + Math.random() * 0.01, 'highpass', 6000 + Math.random() * 4000, 1, 0.05 + Math.random() * 0.05, 0.01 + Math.random() * 0.22, this.pan(this.sfx, (Math.random() - 0.5) * 0.8), undefined, 0.001);
  }

  // ------------------------------------------------------------ público
  /** Voces del público con formantes de vocal (a/e/o/u). */
  private crowdVowel(f1: number, f2: number, dur: number, vol: number, at = 0, sweep = 1, swell = 0.25) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t0 = this.t() + at;
    for (const [f, q, a] of [
      [f1, 4, 1],
      [f2, 6, 0.6],
      [2600, 5, 0.25],
    ] as const) {
      for (const pn of [-0.6, 0.6]) {
        const src = ctx.createBufferSource();
        src.buffer = this.pink;
        src.loop = true;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(f * (0.95 + Math.random() * 0.1), t0);
        bp.frequency.exponentialRampToValueAtTime(f * sweep, t0 + dur);
        bp.Q.value = q;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(vol * a, t0 + swell);
        g.gain.setTargetAtTime(vol * a * 0.6, t0 + swell, dur * 0.25);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        src.connect(bp).connect(g).connect(this.pan(this.sfx, pn + (Math.random() - 0.5) * 0.3));
        src.start(t0, Math.random() * 1.5);
        src.stop(t0 + dur + 0.1);
      }
    }
  }
  /** Público: grito que crece + aplausos + silbidos. */
  cheer(intensity = 1) {
    if (!this.ctx) return;
    const dur = 1.3 + intensity * 1.7;
    this.crowdVowel(700, 1220, dur, 0.5 * intensity, 0, 1.08, 0.18);
    this.crowdVowel(520, 1800, dur * 0.8, 0.28 * intensity, 0.08, 0.95, 0.3);
    this.applause(dur, intensity);
    if (intensity >= 0.8) for (let i = 0; i < Math.round(intensity * 2); i++) this.whistle(0.2 + Math.random() * 0.8);
  }
  /** "¡Oooh!" del público (casi). */
  ooh(intensity = 1, at = 0) {
    this.crowdVowel(380, 820, 1.3, 0.38 * intensity, at, 0.82, 0.22);
  }
  /** "Ohhh…" decepcionado. */
  aww(intensity = 1, at = 0) {
    this.crowdVowel(560, 1000, 1.4, 0.3 * intensity, at, 0.7, 0.15);
  }
  private whistle(at: number) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t0 = this.t() + at;
    const o = ctx.createOscillator();
    const vib = ctx.createOscillator();
    const vg = ctx.createGain();
    vib.frequency.value = 6 + Math.random() * 3;
    vg.gain.value = 40;
    vib.connect(vg).connect(o.frequency);
    const base = 1900 + Math.random() * 700;
    o.frequency.setValueAtTime(base, t0);
    o.frequency.linearRampToValueAtTime(base * 1.45, t0 + 0.18);
    o.frequency.linearRampToValueAtTime(base * 1.3, t0 + 0.6);
    const g = ctx.createGain();
    this.env(g, t0, 0.04, 0.03, 0.6);
    o.connect(g).connect(this.pan(this.sfx, (Math.random() - 0.5) * 1.4));
    o.start(t0);
    vib.start(t0);
    o.stop(t0 + 0.75);
    vib.stop(t0 + 0.75);
  }
  applause(dur = 2, intensity = 1) {
    if (!this.ctx) return;
    const n = Math.round(dur * 80 * intensity);
    for (let i = 0; i < n; i++) {
      const at = Math.random() * dur * (Math.random() < 0.7 ? 0.7 : 1);
      const fade = 1 - at / (dur * 1.1);
      this.noiseBurst(0.012 + Math.random() * 0.012, 'bandpass', 1300 + Math.random() * 2600, 1.4, (0.04 + Math.random() * 0.06 * intensity) * fade, at, this.pan(this.sfx, (Math.random() - 0.5) * 1.6), undefined, 0.001);
    }
  }
  oneEighty() {
    this.cheer(1.6);
    this.crowdVowel(760, 1150, 3.2, 0.5, 0.25, 1.1, 0.3);
    [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.5, 'sawtooth', 0.04, 0.1 + i * 0.07, this.uiBus));
    this.cymbal(1.8, 0.12, 0.05);
    this.say(this.lang === 'es' ? '¡Ciento ochenta!' : 'One hundred and eighty!', true);
  }
  /** Fanfarria de los premios de turno (más grande cuanto más raro el premio). */
  fanfare(tier: number) {
    const notes = tier >= 4 ? [523, 659, 784, 1047, 1319, 1568, 2093] : tier >= 3 ? [523, 659, 784, 1047, 1319] : [587, 740, 880, 1175];
    notes.forEach((f, i) => {
      this.tone(f, 0.32, 'square', 0.035, i * 0.075, this.uiBus);
      this.tone(f * 2, 0.22, 'triangle', 0.025, i * 0.075 + 0.02, this.uiBus);
    });
    this.cymbal(tier >= 3 ? 1.6 : 1, 0.1, notes.length * 0.075);
    this.cheer(tier >= 3 ? 1.3 : 0.8);
    this.sparkle(tier >= 3 ? 1.4 : 0.8);
  }
  /** Latido + subida de tensión (cámara lenta). */
  tension(dur = 1.2) {
    if (!this.ctx) return;
    for (let i = 0; i < 3; i++) {
      this.tone(62, 0.12, 'sine', 0.5, i * 0.42, this.uiBus, 40, 0.004);
      this.tone(58, 0.14, 'sine', 0.35, i * 0.42 + 0.16, this.uiBus, 38, 0.004);
    }
    this.noiseBurst(dur, 'bandpass', 300, 2, 0.08, 0, this.uiBus, 2400, dur * 0.9, true);
  }
  private cymbal(dur: number, vol: number, at = 0) {
    this.noiseBurst(dur, 'highpass', 6500, 0.6, vol, at, this.sfx, 9000, 0.004);
    this.noiseBurst(dur * 0.6, 'bandpass', 4200, 1.2, vol * 0.5, at, this.sfx, undefined, 0.004);
  }

  // ------------------------------------------------------------ interfaz y recompensas
  /** Tienes cierre: dos notas ascendentes suaves. */
  ready() {
    this.bell(1568, 0.045, 0, this.uiBus, 0.6);
    this.bell(2093, 0.05, 0.09, this.uiBus, 0.8);
  }

  /** Aviso (banner): campanilla de dos notas. */
  notify() {
    this.bell(1318.5, 0.07, 0, this.uiBus, 1.1);
    this.bell(1975.5, 0.06, 0.12, this.uiBus, 1.3);
  }
  chestShake() {
    this.tone(110 + Math.random() * 40, 0.09, 'sine', 0.38, 0, this.sfx, 62, 0.001);
    this.noiseBurst(0.06, 'lowpass', 700, 0.8, 0.26, 0, this.sfx, undefined, 0.001);
    // crujido de madera y herrajes
    this.noiseBurst(0.05, 'bandpass', 1800 + Math.random() * 600, 6, 0.08, 0.02);
    this.tone(2400 + Math.random() * 500, 0.08, 'sine', 0.02, 0.01, this.sfx);
  }
  chestOpen() {
    this.noiseBurst(0.7, 'bandpass', 380, 0.8, 0.3, 0, this.sfx, 6000, 0.02);
    this.tone(70, 0.5, 'sine', 0.5, 0, this.sfx, 40, 0.002);
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.7, 'triangle', 0.08, 0.1 + i * 0.06, this.uiBus));
    [2093, 2637, 3136].forEach((f, i) => this.bell(f, 0.04, 0.35 + i * 0.05, this.uiBus, 1));
    this.cymbal(1.4, 0.06, 0.05);
  }
  /** El cofre cae al suelo: golpe sordo de madera con tintineo de herrajes. */
  chestLand() {
    this.tone(78, 0.22, 'sine', 0.55, 0, this.sfx, 42, 0.001);
    this.noiseBurst(0.12, 'lowpass', 520, 0.8, 0.34, 0, this.sfx, 180, 0.001);
    this.noiseBurst(0.08, 'bandpass', 1500, 4, 0.08, 0.02);
    this.bell(1760 + Math.random() * 200, 0.025, 0.03, this.sfx, 0.35);
  }
  /** Cada toque al cofre cerrado: golpe + crujido + una nota que sube con la carga (0…1). */
  chestCharge(level: number) {
    this.chestShake();
    const f = 220 * Math.pow(2, level * 1.1);
    this.tone(f, 0.16, 'triangle', 0.07, 0.01, this.uiBus, f * 1.5, 0.004);
    this.tone(f * 2, 0.12, 'sine', 0.03, 0.03, this.uiBus);
    // traqueteo de la tapa
    for (let i = 0; i < 2 + Math.round(level * 3); i++) this.noiseBurst(0.025, 'bandpass', 900 + Math.random() * 900, 5, 0.07, 0.04 + i * 0.045);
    if (level > 0.5) this.sparkle(level * 0.6);
  }
  /** Carta que sale disparada del cofre. */
  cardWhoosh() {
    this.noiseBurst(0.22, 'bandpass', 700, 1.1, 0.1, 0, this.uiBus, 4800, 0.03);
  }
  /** La carta se da la vuelta. */
  cardFlip() {
    this.noiseBurst(0.035, 'highpass', 2600, 0.8, 0.12, 0, this.uiBus, undefined, 0.001);
    this.tone(900, 0.05, 'sine', 0.06, 0, this.uiBus, 1500, 0.001);
  }
  /** Suspense antes de una carta épica o legendaria: latidos, zumbido que sube y brillos. */
  suspense(dur: number, legendary: boolean) {
    if (!this.ctx) return;
    const beats = Math.max(2, Math.round(dur / 0.32));
    for (let i = 0; i < beats; i++) {
      const at = i * (dur / beats);
      this.tone(60, 0.1, 'sine', 0.45, at, this.uiBus, 40, 0.004);
      this.tone(56, 0.12, 'sine', 0.3, at + 0.13, this.uiBus, 36, 0.004);
    }
    this.noiseBurst(dur, 'bandpass', 300, 2.5, 0.1, 0, this.uiBus, legendary ? 6000 : 4200, dur * 0.95, true);
    this.tone(legendary ? 196 : 174, dur, 'sawtooth', 0.022, 0, this.uiBus, legendary ? 784 : 622, dur * 0.9);
    for (let i = 0; i < 8; i++) this.bell(2400 + i * 260, 0.012 + i * 0.003, (dur * i) / 8, this.uiBus, 0.3);
  }
  /** Sello de «¡Mejorable!»: golpe seco y campanilla. */
  stamp() {
    this.tone(150, 0.1, 'sine', 0.35, 0, this.uiBus, 80, 0.001);
    this.noiseBurst(0.05, 'lowpass', 1200, 0.8, 0.2, 0, this.uiBus, undefined, 0.001);
    this.bell(1568, 0.05, 0.05, this.uiBus, 0.7);
    this.bell(2349, 0.045, 0.11, this.uiBus, 0.8);
  }
  /** Contador que sube (x1, x2, x3…): tic cada vez más agudo. */
  countTick(i: number) {
    this.tone(1200 + Math.min(14, i) * 70, 0.03, 'triangle', 0.05, 0, this.uiBus, undefined, 0.001);
  }
  /** Últimos segundos de la tirada: tic-tac (más agudo y fuerte al final). */
  clockTick(urgent: boolean) {
    this.tone(urgent ? 1760 : 1320, 0.05, 'square', urgent ? 0.05 : 0.03, 0, this.uiBus, undefined, 0.001);
    this.noiseBurst(0.012, 'highpass', 5000, 0.8, urgent ? 0.08 : 0.05, 0, this.uiBus, undefined, 0.001);
  }
  /** Se acabó el tiempo: bocina corta. */
  buzzer() {
    this.tone(196, 0.45, 'sawtooth', 0.07, 0, this.uiBus, 160, 0.004);
    this.tone(207, 0.45, 'square', 0.04, 0, this.uiBus, 170, 0.004);
  }
  /** Subida antes de un momento importante. */
  riser(dur = 0.9) {
    this.noiseBurst(dur, 'bandpass', 400, 3, 0.12, 0, this.uiBus, 5000, dur * 0.95, true);
    this.tone(220, dur, 'sawtooth', 0.025, 0, this.uiBus, 880, dur * 0.9);
  }
  card(r: Rarity) {
    const base = { common: 660, rare: 784, epic: 880, legendary: 1047 }[r];
    this.noiseBurst(0.12, 'highpass', 2000, 0.6, 0.11, 0, this.uiBus);
    [1, 1.25, 1.5].forEach((m, i) => this.tone(base * m, 0.3, 'triangle', 0.075, 0.03 + i * 0.05, this.uiBus));
    if (r === 'epic' || r === 'legendary') {
      [2, 2.5, 3, 4].forEach((m, i) => this.bell(base * m, 0.04, 0.2 + i * 0.07, this.uiBus, 0.9));
      this.cymbal(1.2, 0.05, 0.1);
      if (r === 'legendary') this.cheer(0.7);
    }
  }
  /** Fanfarria de metales (sierras filtradas con envolvente de filtro). */
  private brass(freqs: number[], dur: number, vol: number, at = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t0 = this.t() + at;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 2;
    lp.frequency.setValueAtTime(400, t0);
    lp.frequency.exponentialRampToValueAtTime(3200, t0 + 0.06);
    lp.frequency.exponentialRampToValueAtTime(1200, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.03);
    g.gain.setTargetAtTime(vol * 0.6, t0 + 0.05, 0.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    lp.connect(g).connect(this.uiBus);
    for (const f of freqs)
      for (const det of [-6, 6]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        o.detune.value = det;
        o.connect(lp);
        o.start(t0);
        o.stop(t0 + dur + 0.05);
      }
  }
  levelUp() {
    this.brass([392, 494, 587], 0.16, 0.05, 0);
    this.brass([392, 494, 587], 0.16, 0.05, 0.17);
    this.brass([523, 659, 784], 0.9, 0.06, 0.34);
    [1047, 1319, 1568, 2093].forEach((f, i) => this.bell(f, 0.035, 0.36 + i * 0.06, this.uiBus, 1));
    this.cymbal(1.6, 0.07, 0.34);
    this.tone(65, 0.6, 'sine', 0.35, 0.34, this.uiBus, 45);
  }
  win() {
    this.brass([392, 494, 587], 0.14, 0.05, 0);
    this.brass([440, 554, 659], 0.14, 0.05, 0.15);
    this.brass([523, 659, 784, 1047], 1.2, 0.06, 0.3);
    this.cymbal(2, 0.08, 0.3);
    this.tone(65, 0.7, 'sine', 0.35, 0.3, this.uiBus, 45);
    this.cheer(1.1);
  }
  lose() {
    [392, 349, 311, 262].forEach((f, i) => this.tone(f, 0.45, 'triangle', 0.09, i * 0.22, this.uiBus));
    this.aww(0.6, 0.1);
  }
  whooshUi() {
    this.noiseBurst(0.2, 'bandpass', 1300, 0.9, 0.07, 0, this.uiBus, 4200, 0.05);
  }
  error() {
    this.tone(220, 0.15, 'square', 0.05, 0, this.uiBus);
    this.tone(196, 0.2, 'square', 0.05, 0.12, this.uiBus);
  }

  // ------------------------------------------------------------ ambiente del local
  setAmbience(level: number, room?: Room) {
    this.ambLevel = level;
    if (room) this.setRoom(room);
    if (!this.ctx) return;
    const ctx = this.ctx;
    if (!this.ambNodes.length && level > 0) {
      // murmullo de gente: bandas de formantes con modulación lenta y aleatoria en estéreo
      const bands: [number, number, number][] = [
        [280, 1.2, -0.7],
        [520, 1.6, 0.6],
        [900, 2, -0.3],
        [1500, 2.5, 0.4],
        [2600, 3, 0],
      ];
      for (const [f, q, pn] of bands) {
        const src = ctx.createBufferSource();
        src.buffer = this.pink;
        src.loop = true;
        src.playbackRate.value = 0.9 + Math.random() * 0.2;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = f;
        bp.Q.value = q;
        const g = ctx.createGain();
        g.gain.value = f < 1000 ? 0.5 : 0.25;
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 0.08 + Math.random() * 0.25;
        const lg = ctx.createGain();
        lg.gain.value = 0.18;
        lfo.connect(lg).connect(g.gain);
        const fl = ctx.createOscillator();
        fl.frequency.value = 0.1 + Math.random() * 0.2;
        const fg = ctx.createGain();
        fg.gain.value = f * 0.12;
        fl.connect(fg).connect(bp.frequency);
        src.connect(bp).connect(g).connect(this.pan(this.amb, pn));
        src.start(0, Math.random() * 1.5);
        lfo.start();
        fl.start();
        this.ambNodes.push(src, lfo, fl);
      }
      this.ambEvents();
    }
    if (level <= 0) {
      if (this.ambTimer) clearTimeout(this.ambTimer);
      this.ambTimer = null;
      const nodes = this.ambNodes;
      this.ambNodes = [];
      setTimeout(() => nodes.forEach((n) => (n as AudioScheduledSourceNode).stop?.()), 1500);
    }
    this.amb.gain.setTargetAtTime(level * 0.11 * this.sfxVol, this.t(), 0.5);
  }
  /** Sonidos sueltos del local: vasos, risas, alguna palmada. */
  private ambEvents() {
    const next = () => {
      if (!this.ctx || this.ambLevel <= 0) return;
      const r = Math.random();
      const p = (Math.random() - 0.5) * 1.6;
      const dest = this.pan(this.amb, p);
      if (r < 0.45 && this.room !== 'arena') {
        // choque de vasos
        const f = 2600 + Math.random() * 1600;
        this.bell(f, 0.05, 0, dest, 0.35);
        if (Math.random() < 0.5) this.bell(f * 1.07, 0.04, 0.09, dest, 0.3);
      } else if (r < 0.75) {
        // risa lejana "ja-ja-ja"
        const n = 3 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) this.noiseBurst(0.08, 'bandpass', 700 + Math.random() * 200, 5, 0.12, i * 0.14, dest, 600, 0.02, true);
      } else {
        // algunas palmas
        for (let i = 0; i < 6; i++) this.noiseBurst(0.015, 'bandpass', 1800 + Math.random() * 1500, 1.5, 0.08, Math.random() * 0.6, dest, undefined, 0.001);
      }
      this.ambTimer = setTimeout(next, 2200 + Math.random() * 4500);
    };
    this.ambTimer = setTimeout(next, 1500);
  }

  // ------------------------------------------------------------ música
  startMusic() {
    this.wantMusic = true;
    if (!this.ctx || this.musicTimer) return;
    this.nextNoteTime = this.t() + 0.12;
    this.padBus = this.ctx.createGain();
    this.padBus.connect(this.music);
    this.musicTimer = setInterval(() => this.schedule(), 40);
  }
  stopMusic() {
    this.wantMusic = false;
    if (this.musicTimer) clearInterval(this.musicTimer);
    this.musicTimer = null;
    if (this.padBus && this.ctx) {
      const pb = this.padBus;
      pb.gain.setTargetAtTime(0, this.t(), 0.15);
      setTimeout(() => pb.disconnect(), 1200);
    }
    this.padBus = null;
  }
  private pad(freqs: number[], dur: number, at: number) {
    if (!this.ctx || !this.padBus) return;
    const ctx = this.ctx;
    const t0 = this.t() + at;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 0.7;
    lp.frequency.setValueAtTime(700, t0);
    lp.frequency.linearRampToValueAtTime(1600, t0 + dur * 0.5);
    lp.frequency.linearRampToValueAtTime(900, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(0.03, t0 + 0.6);
    g.gain.setValueAtTime(0.03, t0 + dur - 0.3);
    g.gain.linearRampToValueAtTime(0.0001, t0 + dur + 0.4);
    lp.connect(g).connect(this.padBus);
    for (const f of freqs)
      for (const det of [-9, 0, 9]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        o.detune.value = det;
        o.connect(lp);
        o.start(t0);
        o.stop(t0 + dur + 0.5);
      }
  }
  private pluck(freq: number, vol: number, at: number, dur = 0.22) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t0 = this.t() + at;
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = freq;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(4200, t0);
    lp.frequency.exponentialRampToValueAtTime(500, t0 + dur);
    const g = ctx.createGain();
    this.env(g, t0, 0.003, vol, dur);
    o.connect(lp).connect(g).connect(this.music);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }
  private kick(at: number) {
    if (!this.ctx) return;
    const t0 = this.t() + at;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.frequency.setValueAtTime(150, t0);
    o.frequency.exponentialRampToValueAtTime(42, t0 + 0.12);
    this.env(g, t0, 0.002, 0.42, 0.22);
    o.connect(g).connect(this.music);
    o.start(t0);
    o.stop(t0 + 0.3);
    // "bombeo" del pad con el bombo
    if (this.padBus) {
      this.padBus.gain.setValueAtTime(0.35, t0);
      this.padBus.gain.setTargetAtTime(1, t0 + 0.02, 0.09);
    }
  }
  private schedule() {
    if (!this.ctx) return;
    const bpm = 104;
    const step = 60 / bpm / 4; // semicorcheas
    // vi - IV - I - V en Do (La menor, Fa, Do, Sol): épico pero desenfadado
    const chords = [
      [220.0, 261.6, 329.6],
      [174.6, 220.0, 261.6],
      [261.6, 329.6, 392.0],
      [196.0, 246.9, 293.7],
    ];
    const roots = [110, 87.3, 130.8, 98];
    const melody = [4, -1, 5, 4, 2, -1, 0, 2, 4, -1, 7, 5, 4, 2, 4, -1];
    const scale = [523.3, 587.3, 659.3, 698.5, 784.0, 880.0, 987.8, 1046.5];
    while (this.nextNoteTime < this.t() + 0.25) {
      const s = this.musicStep;
      const inBar = s % 16;
      const bar = Math.floor(s / 16);
      const ci = bar % 4;
      const section = Math.floor(bar / 8) % 3; // A: base, B: + arpegio, C: + melodía
      const ch = chords[ci];
      const at = this.nextNoteTime - this.t();
      const swing = inBar % 2 === 1 ? step * 0.12 : 0;
      if (inBar === 0) this.pad(ch, step * 16, at);
      // batería
      if (inBar === 0 || inBar === 8 || (inBar === 10 && section > 0)) this.kick(at);
      if (inBar === 4 || inBar === 12) {
        this.noiseBurst(0.12, 'bandpass', 1900, 0.9, 0.07, at, this.music, undefined, 0.002);
        this.tone(190, 0.08, 'triangle', 0.06, at, this.music, 140, 0.001);
      }
      if (inBar % 2 === 0) this.noiseBurst(inBar === 14 ? 0.14 : 0.025, 'highpass', 7500, 0.7, inBar % 4 === 2 ? 0.03 : 0.018, at + swing, this.music, undefined, 0.001);
      // bajo
      if (inBar % 4 === 0 || inBar === 6 || inBar === 14) {
        const f = roots[ci] * (inBar === 6 ? 1.5 : inBar === 14 ? 2 : 1);
        this.tone(f, step * 1.8, 'triangle', 0.15, at, this.music, undefined, 0.004);
        this.tone(f, step * 1.2, 'square', 0.025, at, this.music, undefined, 0.004);
      }
      // arpegio
      if (section >= 1 && inBar % 2 === 0) {
        const n = ch[(inBar / 2) % 3] * (inBar % 8 < 4 ? 2 : 4);
        this.pluck(n, 0.022, at + swing);
      }
      // melodía
      if (section === 2 && inBar % 2 === 0) {
        const m = melody[(inBar / 2 + (bar % 2) * 8) % melody.length];
        if (m >= 0) this.tone(scale[m], step * 1.9, 'square', 0.016, at, this.music, undefined, 0.01);
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
