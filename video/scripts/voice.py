"""Generate the voiceover, scene timeline and word-timed captions for the review video.

narration.json -> public/narration.mp3   one track, scenes separated by a short pause
               -> public/timeline.json   start/duration of each scene in seconds
               -> public/captions.json   word timings (Remotion Caption format) from faster-whisper
               -> out/btr-review.srt     sentence-level subtitles for YouTube and other players

Captions come from transcribing the generated audio rather than the script, so they match
what the voice actually says and when.
"""
import asyncio
import json
import subprocess
import sys
from pathlib import Path

import edge_tts
from faster_whisper import WhisperModel

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
OUT = ROOT / "out"
TMP = ROOT / "out" / "voice-tmp"


def duration(path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
        capture_output=True, text=True, check=True,
    )
    return float(out.stdout.strip())


async def synthesize(text, voice, rate, path):
    await edge_tts.Communicate(text, voice, rate=rate).save(str(path))


def srt_time(seconds):
    ms = round(seconds * 1000)
    h, ms = divmod(ms, 3_600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:02}:{m:02}:{s:02},{ms:03}"


def subtitle_lines(words, max_words=9):
    # Break at sentence ends, commas after a few words, or a word limit.
    lines, cur = [], []
    for w in words:
        cur.append(w)
        t = w["text"].strip()
        if t.endswith((".", "?", "!")) or len(cur) >= max_words or (t.endswith(",") and len(cur) >= 5):
            lines.append(cur)
            cur = []
    if cur:
        lines.append(cur)
    return lines


def apply_fixes(words, fixes):
    # Whisper occasionally mishears names ("Bt, our" for "btr"). Replace a run of words whose
    # joined text matches a key, spreading the replacement across the run's original time span.
    for wrong, right in fixes.items():
        n = len(wrong.split())
        for i in range(len(words) - n + 1):
            run = words[i:i + n]
            if " ".join(w["text"].strip() for w in run) != wrong:
                continue
            new = right.split()
            start, end = run[0]["startMs"], run[-1]["endMs"]
            step = (end - start) / len(new)
            words[i:i + n] = [{
                "text": " " + t,
                "startMs": round(start + k * step),
                "endMs": round(start + (k + 1) * step),
                "timestampMs": round(start + (k + 0.5) * step),
                "confidence": 1.0,
            } for k, t in enumerate(new)]
            break
        else:
            print(f"caption fix not applied: {wrong!r}", file=sys.stderr)
    return words


def main():
    cfg = json.loads((ROOT / "narration.json").read_text(encoding="utf-8"))
    TMP.mkdir(parents=True, exist_ok=True)
    PUBLIC.mkdir(exist_ok=True)

    timeline, parts, t = [], [], 0.0
    gap = cfg["gapSeconds"]
    for scene in cfg["scenes"]:
        mp3 = TMP / f"{scene['id']}.mp3"
        print(f"voice: {scene['id']}", file=sys.stderr)
        asyncio.run(synthesize(scene["text"], cfg["voice"], cfg["rate"], mp3))
        d = duration(mp3)
        timeline.append({"id": scene["id"], "start": round(t, 3), "duration": round(d + gap, 3)})
        parts.append(mp3)
        t += d + gap

    # Concatenate with a pause after each scene: decode, pad, then encode once.
    inputs, filters = [], []
    for i, p in enumerate(parts):
        inputs += ["-i", str(p)]
        filters.append(f"[{i}:a]aresample=48000,apad=pad_dur={gap}[a{i}]")
    concat = "".join(f"[a{i}]" for i in range(len(parts))) + f"concat=n={len(parts)}:v=0:a=1[out]"
    narration = PUBLIC / "narration.mp3"
    subprocess.run(
        ["ffmpeg", "-loglevel", "error", "-y", *inputs, "-filter_complex", ";".join(filters + [concat]),
         "-map", "[out]", "-b:a", "192k", str(narration)],
        check=True,
    )

    print("transcribing for word timings", file=sys.stderr)
    model = WhisperModel("small.en", device="cpu", compute_type="int8")
    segments, _ = model.transcribe(str(narration), word_timestamps=True, initial_prompt="btr, GitHub, SSH, Codex, Gemini CLI, OpenCode, Claude Code.")
    words = []
    for seg in segments:
        for w in seg.words:
            words.append({
                "text": w.word,  # keeps Whisper's leading space, which @remotion/captions expects
                "startMs": round(w.start * 1000),
                "endMs": round(w.end * 1000),
                "timestampMs": round((w.start + w.end) * 500),
                "confidence": round(w.probability, 3),
            })

    words = apply_fixes(words, cfg.get("captionFixes", {}))

    (PUBLIC / "timeline.json").write_text(json.dumps({"total": round(t, 3), "scenes": timeline}, indent=2))
    (PUBLIC / "captions.json").write_text(json.dumps(words, indent=1))

    srt = []
    for i, line in enumerate(subtitle_lines(words), 1):
        text = "".join(w["text"] for w in line).strip()
        srt.append(f"{i}\n{srt_time(line[0]['startMs'] / 1000)} --> {srt_time(line[-1]['endMs'] / 1000)}\n{text}\n")
    OUT.mkdir(exist_ok=True)
    (OUT / "btr-review.srt").write_text("\n".join(srt), encoding="utf-8")
    print(f"done: {t:.1f}s, {len(words)} words, {len(srt)} subtitle lines", file=sys.stderr)


if __name__ == "__main__":
    main()
