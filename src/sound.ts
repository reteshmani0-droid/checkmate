/**
 * Sound, synthesised in the browser: no files to download, so the first move is never silent
 * because a sound is still loading. A wooden tap for a move, a heavier one for a capture, a
 * rising figure for promotion.
 *
 * The audio context is created on the first gesture the page sees, which is what browsers require.
 */

export type SfxName = 'move' | 'capture' | 'castle' | 'check' | 'promote' | 'win' | 'lose' | 'draw' | 'illegal' | 'click';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = true;
let unlocked = false;

function audio(): AudioContext | null
{
    if (!ctx)
    {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return null;
        try
        {
            ctx = new Ctor();
            master = ctx.createGain();
            master.gain.value = 0.55;
            master.connect(ctx.destination);
        }
        catch
        {
            return null;
        }
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
}

export function unlockAudio(): void
{
    if (unlocked) return;
    unlocked = true;
    audio();
}

export function setSound(on: boolean): void
{
    enabled = on;
}

function noiseBuffer(context: AudioContext, seconds: number): AudioBuffer
{
    const length = Math.max(1, Math.floor(context.sampleRate * seconds));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++)
    {
        const t = i / length;
        data[i] = (Math.random() * 2 - 1) * (1 - t) * (1 - t);
    }
    return buffer;
}

type NoiseOptions = { at?: number; seconds?: number; freq?: number; q?: number; gain?: number; type?: BiquadFilterType };

function noise(options: NoiseOptions = {}): void
{
    const context = audio();
    if (!context || !master) return;
    const { at = 0, seconds = 0.09, freq = 1100, q = 1.1, gain = 0.5, type = 'bandpass' } = options;
    const source = context.createBufferSource();
    source.buffer = noiseBuffer(context, seconds);
    const filter = context.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const envelope = context.createGain();
    const start = context.currentTime + at;
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(gain, start + 0.006);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + seconds);
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(master);
    source.start(start);
    source.stop(start + seconds + 0.02);
}

type ToneOptions = { at?: number; freq: number; to?: number; seconds?: number; gain?: number; type?: OscillatorType; };

function tone(options: ToneOptions): void
{
    const context = audio();
    if (!context || !master) return;
    const { at = 0, freq, to, seconds = 0.16, gain = 0.16, type = 'sine' } = options;
    const osc = context.createOscillator();
    osc.type = type;
    const start = context.currentTime + at;
    osc.frequency.setValueAtTime(freq, start);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, start + seconds);
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(gain, start + 0.012);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + seconds);
    osc.connect(envelope);
    envelope.connect(master);
    osc.start(start);
    osc.stop(start + seconds + 0.02);
}

export function play(name: SfxName): void
{
    if (!enabled) return;
    switch (name)
    {
        case 'move':
            noise({ freq: 1250, q: 0.8, gain: 0.42, seconds: 0.055 });
            tone({ freq: 220, to: 150, seconds: 0.07, gain: 0.14, type: 'triangle' });
            break;
        case 'capture':
            noise({ freq: 760, q: 0.6, gain: 0.55, seconds: 0.11 });
            tone({ freq: 150, to: 90, seconds: 0.13, gain: 0.22, type: 'triangle' });
            break;
        case 'castle':
            noise({ freq: 1250, q: 0.8, gain: 0.36, seconds: 0.05 });
            noise({ at: 0.09, freq: 1050, q: 0.8, gain: 0.34, seconds: 0.05 });
            break;
        case 'check':
            tone({ freq: 880, seconds: 0.10, gain: 0.14, type: 'triangle' });
            tone({ at: 0.09, freq: 1180, seconds: 0.14, gain: 0.12, type: 'triangle' });
            break;
        case 'promote':
            tone({ freq: 523, seconds: 0.10, gain: 0.12, type: 'triangle' });
            tone({ at: 0.08, freq: 659, seconds: 0.10, gain: 0.12, type: 'triangle' });
            tone({ at: 0.16, freq: 784, seconds: 0.20, gain: 0.13, type: 'triangle' });
            break;
        case 'win':
            tone({ freq: 523, seconds: 0.16, gain: 0.13, type: 'triangle' });
            tone({ at: 0.13, freq: 659, seconds: 0.16, gain: 0.13, type: 'triangle' });
            tone({ at: 0.26, freq: 784, seconds: 0.34, gain: 0.14, type: 'triangle' });
            break;
        case 'lose':
            tone({ freq: 392, seconds: 0.20, gain: 0.13, type: 'triangle' });
            tone({ at: 0.16, freq: 311, seconds: 0.30, gain: 0.12, type: 'triangle' });
            break;
        case 'draw':
            tone({ freq: 440, seconds: 0.18, gain: 0.11, type: 'triangle' });
            tone({ at: 0.15, freq: 440, seconds: 0.24, gain: 0.10, type: 'triangle' });
            break;
        case 'illegal':
            tone({ freq: 150, to: 110, seconds: 0.12, gain: 0.12, type: 'square' });
            break;
        case 'click':
            noise({ freq: 1900, q: 1.4, gain: 0.16, seconds: 0.03 });
            break;
    }
}
