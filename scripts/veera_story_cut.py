"""Cut Veera's story film from the generated clips: shots separated by black story cards with captions, each
shot holding its last frame for a moment before it fades to black, a title card at the end.

    python3 scripts/veera_story_cut.py <workshop clip> <rooftop clip> <ring clip> <out.mp4> [--app]

--app: the cut for her hero page (HeroScreen STORY_VIDEOS): no closing cards; it ends on the fight's last shot,
held still for APP_HOLD seconds without fading, because the app lays its title card over that hold and then
shows the same frame (her still) with the 3D hero standing where she stood. Prints when the hold starts.

The clips (Google Flow, 12 s, 1920x1080, 24 fps) each hold two shots, cut at CUT seconds:
  workshop: the catwalk walk | fitting the iron arm at the bench
  rooftop:  shadowboxing at sunrise | the heavy bag
  ring:     the face close-up (until 1.958 s) | the fight
Every part is encoded to the same format and the parts are joined with the concat demuxer.
"""
import os
import subprocess
import sys
import tempfile

WORKSHOP, ROOFTOP, RING, OUT = sys.argv[1:5]
APP = '--app' in sys.argv[5:]
APP_HOLD = 3.5
CUT = 5.958
FACE_CUT = 1.958
END = 11.958
FPS = 24
W, H = 1920, 1080
FONT = '/usr/share/fonts/TTF/FiraSansCondensed-Light.ttf'
TITLE_FONT = '/usr/share/fonts/TTF/FiraSansCompressed-Bold.ttf'
HOLD = 0.8          # each shot freezes on its last frame this long before fading out
FADE = 0.6
CARD = 3.4          # seconds of black per story card
DIP = 0.7           # a short dip to black between two shots of the same beat

ENC = ['-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', str(FPS),
       '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2']

tmp = tempfile.mkdtemp(prefix='veera_cut_')
parts = []
texts = [0]   # a running count, so every caption line gets its own text file


def run(args):
    subprocess.run(['ffmpeg', '-v', 'error', '-y'] + args, check=True)


def shot(src, start, end, hold=HOLD, fade_in=True, fade_out=True):
    """a piece of a clip: fades in, holds its last frame, fades out (sound with it)"""
    n = len(parts)
    out = os.path.join(tmp, f'{n:02d}.mp4')
    dur = end - start + hold
    vf = (f'trim=start={start}:end={end},setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration={hold},'
          + (f'fade=t=in:st=0:d={FADE},' if fade_in else '') + (f'fade=t=out:st={dur - FADE}:d={FADE},' if fade_out else '')
          + f'scale={W}:{H},fps={FPS},format=yuv420p')
    af = (f'atrim=start={start}:end={end},asetpts=PTS-STARTPTS,apad=pad_dur={hold},'
          f'afade=t=in:st=0:d={FADE},afade=t=out:st={dur - FADE}:d={FADE}')   # (the sound fades either way)
    run(['-i', src, '-filter_complex', f'[0:v]{vf}[v];[0:a]{af}[a]', '-map', '[v]', '-map', '[a]',
         '-t', f'{dur:.3f}'] + ENC + [out])
    parts.append(out)


def _text(lines, font, size, gap, fade_from, fade_len, dur, color='white'):
    """drawtext filters for centred lines that fade in and out"""
    alpha = (f"if(lt(t,{fade_from}),0,if(lt(t,{fade_from + fade_len}),(t-{fade_from})/{fade_len},"
             f"if(lt(t,{dur - fade_len}),1,max(0,({dur}-t)/{fade_len}))))")
    filters = []
    total = len(lines) * size + (len(lines) - 1) * gap
    for i, line in enumerate(lines):
        texts[0] += 1
        f = os.path.join(tmp, f'line_{texts[0]}.txt')   # (per part and line collided: the subtitle overwrote the title)
        with open(f, 'w') as fh:
            fh.write(line)
        y = f'(h-{total})/2+{i * (size + gap)}'
        filters.append(f"drawtext=fontfile={font}:textfile={f}:fontsize={size}:fontcolor={color}:"
                       f"x=(w-text_w)/2:y={y}:alpha='{alpha}'")
    return filters


def card(lines, dur=CARD, size=68, font=FONT, sub=None):
    """black, the caption fading in and out; silent"""
    n = len(parts)
    out = os.path.join(tmp, f'{n:02d}.mp4')
    flt = _text(lines, font, size, 22, 0.5, 0.7, dur)
    if sub:
        flt += [f.replace(f'y=(h-', 'y=180+(h-') for f in _text(sub, FONT, 44, 12, 1.2, 0.7, dur, '#36F1CD')]
    run(['-f', 'lavfi', '-i', f'color=c=black:s={W}x{H}:r={FPS}:d={dur}',
         '-f', 'lavfi', '-i', f'anullsrc=r=48000:cl=stereo', '-t', f'{dur}',
         '-filter_complex', f"[0:v]{','.join(flt)},format=yuv420p[v]", '-map', '[v]', '-map', '1:a'] + ENC + [out])
    parts.append(out)


def dip(dur=DIP):
    card([' '], dur=dur)


card(['Down in the undercity,', 'the factories never sleep.'])
shot(WORKSHOP, 0, CUT)
card(['A press on the night shift took her arm.', 'So she built a new one.'])
shot(WORKSHOP, CUT, END)
card(['And a body strong enough to carry it.'])
shot(ROOFTOP, 0, CUT)
dip()
shot(ROOFTOP, CUT, END)
card(['Then she took it to the street rings.'])
shot(RING, 0, FACE_CUT, hold=0.5)
dip(0.5)
if APP:
    def length(p):
        return float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p],
                                    capture_output=True, text=True).stdout)
    hold_at = sum(length(p) for p in parts) + (END - FACE_CUT)
    shot(RING, FACE_CUT, END, hold=APP_HOLD, fade_out=False)
    print('HOLD_AT', round(hold_at, 2))
else:
    shot(RING, FACE_CUT, END, hold=2.2)
    card(['Every win goes back to the street.'])
    card(['VEERA'], dur=4.2, size=190, font=TITLE_FONT, sub=['THE UNDERCITY BRAWLER'])

lst = os.path.join(tmp, 'list.txt')
with open(lst, 'w') as fh:
    fh.writelines(f"file '{p}'\n" for p in parts)
run(['-f', 'concat', '-safe', '0', '-i', lst, '-c', 'copy', '-movflags', '+faststart', OUT])
print('WROTE', OUT, len(parts), 'parts')
