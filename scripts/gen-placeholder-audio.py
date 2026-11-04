#!/usr/bin/env python3
"""Synthesise PLACEHOLDER sound effects and music loops for the juice layer.

Original synthesised tones (dedicated CC0), so the app has working audio before the final CC0 sounds are
chosen (design page 49, open question 1). Needs ffmpeg with libmp3lame.

Usage: python3 scripts/gen-placeholder-audio.py   (writes assets/audio/sfx/*.mp3 and assets/audio/music/*.mp3)
"""
import math
import os
import random
import struct
import subprocess
import tempfile
import wave

RATE = 44100
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'audio')


def note(freq, dur, vol=0.5, shape='sine', attack=0.005, release=None):
    """One enveloped note as a list of floats."""
    n = int(dur * RATE)
    release = dur * 0.6 if release is None else release
    out = []
    for i in range(n):
        t = i / RATE
        ph = 2 * math.pi * freq * t
        if shape == 'square':
            s = 1.0 if math.sin(ph) >= 0 else -1.0
            s *= 0.35
        elif shape == 'tri':
            s = 2 / math.pi * math.asin(math.sin(ph))
        else:
            s = math.sin(ph) + 0.25 * math.sin(2 * ph)
        env = min(1.0, t / attack) if attack > 0 else 1.0
        tail = dur - t
        if tail < release:
            env *= max(0.0, tail / release)
        out.append(s * env * vol)
    return out


def mix(*tracks, offsets=None):
    offsets = offsets or [0.0] * len(tracks)
    length = max(int(o * RATE) + len(t) for t, o in zip(tracks, offsets))
    buf = [0.0] * length
    for t, o in zip(tracks, offsets):
        start = int(o * RATE)
        for i, v in enumerate(t):
            buf[start + i] += v
    return buf


def seq(freqs, step, dur, **kw):
    return mix(*[note(f, dur, **kw) for f in freqs], offsets=[i * step for i in range(len(freqs))])


def noise(dur, vol=0.3):
    rnd = random.Random(7)
    n = int(dur * RATE)
    return [rnd.uniform(-1, 1) * vol * (1 - i / n) ** 3 for i in range(n)]


def write_mp3(samples, path, channels=1, bitrate='96k'):
    peak = max(1e-9, max(abs(s) for s in samples))
    scale = 0.89 / peak
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp:
        wav_path = tmp.name
    with wave.open(wav_path, 'wb') as w:
        w.setnchannels(channels)
        w.setsampwidth(2)
        w.setframerate(RATE)
        frames = bytearray()
        for s in samples:
            v = int(max(-1.0, min(1.0, s * scale)) * 32767)
            frames += struct.pack('<h', v) * channels
        w.writeframes(bytes(frames))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav_path, '-codec:a', 'libmp3lame', '-b:a', bitrate, path], check=True)
    os.remove(wav_path)


C4, D4, E4, F4, G4, A4, B4 = 261.63, 293.66, 329.63, 349.23, 392.0, 440.0, 493.88
C5, E5, G5, C6 = 523.25, 659.25, 783.99, 1046.5

SFX = {
    'tap': lambda: note(1200, 0.04, 0.4, release=0.03),
    'toggle': lambda: seq([900, 1200], 0.05, 0.05, vol=0.35),
    'ready': lambda: seq([C5, E5, G5], 0.09, 0.12, vol=0.4),
    'fight': lambda: mix(seq([G4, C5, E5, G5], 0.05, 0.3, vol=0.45, shape='square'), noise(0.2, 0.25)),
    'rep': lambda: note(C6, 0.12, 0.5, release=0.1),
    'hold_mark': lambda: mix(note(G5, 0.3, 0.4), note(1174.7, 0.3, 0.3), offsets=[0, 0.04]),
    'rival_rep': lambda: note(520, 0.09, 0.3, shape='tri', release=0.07),
    'combo': lambda: seq([C5, E5, G5, C6], 0.06, 0.15, vol=0.45),
    'lead_take': lambda: seq([G4, C5, E5, G5], 0.08, 0.2, vol=0.45, shape='square'),
    'lead_lost': lambda: seq([E5, C5], 0.14, 0.25, vol=0.35, shape='tri'),
    'tick': lambda: note(1500, 0.03, 0.4, shape='square', release=0.025),
    'win': lambda: mix(seq([C5, E5, G5], 0.12, 0.25, vol=0.45, shape='square'), mix(note(C5, 0.8, 0.3), note(E5, 0.8, 0.25), note(G5, 0.8, 0.25), note(C6, 0.8, 0.2)), offsets=[0, 0.36]),
    'lose': lambda: seq([G4, F4, D4], 0.22, 0.35, vol=0.4, shape='tri'),
    'draw': lambda: seq([E5, E5], 0.2, 0.25, vol=0.35),
    'level_up': lambda: seq([C5, E5, G5, C6, E5 * 2], 0.08, 0.3, vol=0.4),
    'rank_up': lambda: mix(seq([G4, C5, E5, G5, C6], 0.09, 0.3, vol=0.45, shape='square'), mix(note(C5, 0.9, 0.3), note(G5, 0.9, 0.25), note(C6, 0.9, 0.25)), offsets=[0, 0.5]),
    'quest_done': lambda: mix(note(G5, 0.5, 0.35), note(C6, 0.5, 0.3), offsets=[0, 0.1]),
}


def loop(chords, bpm, bars, lead_vol):
    """Simple chord-and-pluck loop, `bars` bars of 4 beats, seamless (ends on a beat boundary)."""
    beat = 60.0 / bpm
    parts, offs = [], []
    for b in range(bars):
        root = chords[b % len(chords)]
        t0 = b * 4 * beat
        for k in range(4):
            parts.append(note(root / 2, beat * 0.9, 0.35, shape='tri'))
            offs.append(t0 + k * beat)
            parts.append(note(root * (1.5 if k % 2 else 1.25) * 2, beat * 0.4, lead_vol))
            offs.append(t0 + k * beat + beat / 2)
    buf = mix(*parts, offsets=offs)
    return buf[: int(bars * 4 * beat * RATE)]


def main():
    for name, make in SFX.items():
        write_mp3(make(), os.path.join(ROOT, 'sfx', name + '.mp3'))
        print('sfx', name)
    write_mp3(loop([C4, A4, F4, G4], 100, 12, 0.18), os.path.join(ROOT, 'music', 'menu_loop.mp3'), channels=2, bitrate='128k')
    write_mp3(loop([A4, F4, C4, G4], 124, 16, 0.22), os.path.join(ROOT, 'music', 'match_loop.mp3'), channels=2, bitrate='128k')
    print('music done')


if __name__ == '__main__':
    main()
