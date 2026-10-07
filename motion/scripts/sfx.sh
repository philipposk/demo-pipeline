#!/bin/sh
# Regenerates public/sfx/click.wav and whoosh.wav from scratch with ffmpeg (synthesised, no samples, nothing to license).
set -e
cd "$(dirname "$0")/.."
mkdir -p public/sfx
# click: a 1.9 kHz sine tick with a quick decay, over a soft 180 Hz thump
ffmpeg -v error -y \
  -f lavfi -i "sine=frequency=1900:duration=0.09:sample_rate=48000" \
  -f lavfi -i "sine=frequency=180:duration=0.09:sample_rate=48000" \
  -filter_complex "[0]volume=0.5,afade=t=out:st=0.004:d=0.08:curve=exp[a];[1]volume=0.45,afade=t=out:st=0.004:d=0.08:curve=exp[b];[a][b]amix=inputs=2:normalize=0,alimiter=limit=0.8" \
  -ac 1 -ar 48000 public/sfx/click.wav
# whoosh: pink noise through a band-pass whose centre sweeps up, with a soft fade in and out
ffmpeg -v error -y -f lavfi -i "anoisesrc=color=pink:duration=0.7:sample_rate=48000:seed=7" \
  -af "bandpass=f=900:width_type=q:w=0.7,highpass=f=250,lowpass=f=5500,afade=t=in:st=0:d=0.28:curve=qsin,afade=t=out:st=0.28:d=0.42:curve=qsin,volume=1.6,alimiter=limit=0.8" \
  -ac 1 -ar 48000 public/sfx/whoosh.wav
