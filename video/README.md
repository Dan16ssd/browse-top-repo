# Review video

This folder is a [Remotion](https://www.remotion.dev) project that renders the btr review video
(`docs/btr-review.mp4` and `docs/btr-review-vertical.mp4`). It is not needed to use btr.

The voice is generated with edge-tts from `narration.json`, and faster-whisper transcribes it so the
subtitles are timed to the actual speech. Requires Node, Python 3 with `edge-tts` and
`faster-whisper`, and ffmpeg.

```sh
npm install
npm run voice            # narration.json -> narration.mp3, timeline, word captions, .srt
npm run render           # -> out/btr-review.mp4 (1920x1080)
npm run render:vertical  # -> out/btr-review-vertical.mp4 (1080x1920, captions clear of app UI)
npm run studio           # preview and edit in the browser
```

To change what is said, edit the scene text in `narration.json` and run `npm run voice` again. If
Whisper mishears a word in the subtitles, add a correction to `captionFixes` in the same file.
