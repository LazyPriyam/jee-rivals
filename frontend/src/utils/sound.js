class SoundSynthesizer {
  constructor() {
    this.ctx = null;
    this.muted = localStorage.getItem('jee_sound_muted') === 'true';
  }

  init() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
  }

  isMuted() {
    return this.muted;
  }

  toggleMute() {
    this.muted = !this.muted;
    localStorage.setItem('jee_sound_muted', String(this.muted));
    return this.muted;
  }

  playTone(freq, duration, type = 'sine', startTime = 0) {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    try {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime + startTime);

      gain.gain.setValueAtTime(0.12, this.ctx.currentTime + startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + startTime + duration);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(this.ctx.currentTime + startTime);
      osc.stop(this.ctx.currentTime + startTime + duration);
    } catch (_) {}
  }

  click() {
    this.playTone(800, 0.04, 'triangle');
  }

  correct() {
    this.playTone(523.25, 0.12, 'sine', 0);     // C5
    this.playTone(659.25, 0.18, 'sine', 0.1);   // E5
    this.playTone(783.99, 0.28, 'sine', 0.2);   // G5
  }

  wrong() {
    this.playTone(180, 0.25, 'sawtooth', 0);
    this.playTone(140, 0.35, 'sawtooth', 0.1);
  }

  tick() {
    this.playTone(900, 0.03, 'sine');
  }

  victory() {
    this.playTone(523.25, 0.15, 'triangle', 0);
    this.playTone(659.25, 0.15, 'triangle', 0.15);
    this.playTone(783.99, 0.15, 'triangle', 0.3);
    this.playTone(1046.50, 0.45, 'triangle', 0.45);
  }

  notif() {
    this.playTone(587.33, 0.08, 'sine', 0);     // D5
    this.playTone(880.00, 0.16, 'sine', 0.08);  // A5
  }
}

export const sound = new SoundSynthesizer();
export default sound;
