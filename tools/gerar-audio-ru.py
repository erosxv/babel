# Generates the Russian audio with Silero (v5_ru), a free AI voice that runs on this PC (no account, no key).
# Setup, once:  pip install torch soundfile omegaconf   and ffmpeg on the PATH. The model downloads itself
# from github.com/snakers4/silero-models the first time.
# Run:  node tools/frases-ru.js  then  python -X utf8 tools/gerar-audio-ru.py
# Only lines without a file yet are generated, so it can be run again after adding content.
# A voice is "speaker" or "speaker:pitch" (x-low, low, high, x-high); see tools/frases-ru.js.
# Silero's license allows free non-commercial use; a paid app would need their commercial license.
import io, json, os, subprocess, sys, time
from xml.sax.saxutils import escape
import soundfile as sf
import torch

here = os.path.dirname(os.path.abspath(__file__))
outdir = os.path.join(here, "..", "audio", "ru")
os.makedirs(outdir, exist_ok=True)
model, _ = torch.hub.load("snakers4/silero-models", "silero_tts", language="ru", speaker="v5_ru", trust_repo=True)
if torch.cuda.is_available():
    model.to(torch.device("cuda"))
SR = 48000
lines = json.load(io.open(os.path.join(here, "frases-ru.json"), encoding="utf8"))
t0, done, failed = time.time(), 0, []
for i, ln in enumerate(lines):
    mp3 = os.path.join(outdir, ln["key"] + ".mp3")
    if os.path.exists(mp3):
        continue
    speaker, _, pitch = ln["voice"].partition(":")
    text = ln.get("tts", ln["text"])
    try:
        if pitch:
            audio = model.apply_tts(ssml_text=f'<speak><prosody pitch="{pitch}">{escape(text)}</prosody></speak>', speaker=speaker, sample_rate=SR, put_accent=True, put_yo=True)
        else:
            audio = model.apply_tts(text=text, speaker=speaker, sample_rate=SR, put_accent=True, put_yo=True)
    except Exception as e:
        failed.append((ln["text"], repr(e)[:120]))
        continue
    buf = io.BytesIO()
    sf.write(buf, audio.cpu().numpy(), SR, format="WAV")
    # a short silence at the end, so phones don't clip the last syllable
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-f", "wav", "-i", "-", "-af", "apad=pad_dur=0.15", "-ac", "1", "-ar", "24000", "-b:a", "48k", mp3], input=buf.getvalue(), check=True)
    done += 1
    if done % 100 == 0:
        print(f"{i + 1}/{len(lines)}  {time.time() - t0:.0f}s", flush=True)
# the game reads this list to know which lines have a file
keys = sorted(ln["key"] for ln in lines if os.path.exists(os.path.join(outdir, ln["key"] + ".mp3")))
io.open(os.path.join(outdir, "index.json"), "w", encoding="utf8").write(json.dumps(keys))
for t, e in failed:
    print("falhou:", t, e)
print("ok", len(keys), "arquivos,", done, "novos,", len(failed), "falhas")
