# Generates the game's audio with Kokoro, a free AI voice that runs on this PC (no account, no key).
# Setup, once:  pip install kokoro-onnx soundfile   and ffmpeg on the PATH.
# The two model files (kokoro-v1.0.onnx and voices-v1.0.bin, from github.com/thewh1teagle/kokoro-onnx,
# release "model-files-v1.0") go in %LOCALAPPDATA%\xibolete-voz.
# Run:  node tools/frases-en.js  then  python -X utf8 tools/gerar-audio.py en
# Only lines without a file yet are generated, so it can be run again after adding content.
import io, json, os, subprocess, sys, time
import soundfile as sf
from kokoro_onnx import Kokoro

lang = sys.argv[1] if len(sys.argv) > 1 else "en"
here = os.path.dirname(os.path.abspath(__file__))
outdir = os.path.join(here, "..", "audio", lang)
os.makedirs(outdir, exist_ok=True)
models = os.path.join(os.environ["LOCALAPPDATA"], "xibolete-voz")
k = Kokoro(os.path.join(models, "kokoro-v1.0.onnx"), os.path.join(models, "voices-v1.0.bin"))
lines = json.load(io.open(os.path.join(here, f"frases-{lang}.json"), encoding="utf8"))
t0, done = time.time(), 0
for i, ln in enumerate(lines):
    mp3 = os.path.join(outdir, ln["key"] + ".mp3")
    if os.path.exists(mp3):
        continue
    audio, sr = k.create(ln["text"], voice=ln["voice"], speed=1.0, lang="en-us")
    buf = io.BytesIO()
    sf.write(buf, audio, sr, format="WAV")
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-f", "wav", "-i", "-", "-ac", "1", "-b:a", "48k", mp3], input=buf.getvalue(), check=True)
    done += 1
    if done % 50 == 0:
        print(f"{i + 1}/{len(lines)}  {time.time() - t0:.0f}s", flush=True)
# the game reads this list to know which lines have a file
keys = sorted(ln["key"] for ln in lines if os.path.exists(os.path.join(outdir, ln["key"] + ".mp3")))
io.open(os.path.join(outdir, "index.json"), "w", encoding="utf8").write(json.dumps(keys))
print("ok", len(keys), "arquivos,", done, "novos")
