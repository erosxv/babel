# Records the game's lines with Chatterbox, a free AI voice with intonation and emotion that runs on the
# PC's graphics card. Each voice copies a reference clip in tools/vozes/<voice>.mp3, so every character
# keeps the voice they had with Kokoro. A second AI (Whisper) listens to every clip; a clip that does not
# say the line is recorded again, and after 3 failed tries the old Kokoro file is kept.
# Setup, once (a separate Python 3.11, in %LOCALAPPDATA%\xibolete-voz\cb):
#   python -m uv venv cb --python 3.11
#   python -m uv pip install --python cb/Scripts/python.exe chatterbox-tts faster-whisper "setuptools<81"
#   python -m uv pip install --python cb/Scripts/python.exe --reinstall torch==2.6.0 torchaudio==2.6.0 --index-url https://download.pytorch.org/whl/cu124
# Run:  node tools/frases-en.js  then  %LOCALAPPDATA%\xibolete-voz\cb\Scripts\python.exe -X utf8 tools/gerar-audio-chatterbox.py en
# New clips go to audio/<lang>-novo/ first; they replace audio/<lang>/ at the end. Stopping and running
# again picks up where it stopped, and lines listed in tools/relatorio-chatterbox-<lang>.json are skipped,
# so after adding lines only the new ones are recorded (run gerar-audio.py first: it makes their Kokoro
# clip, which stays when Chatterbox can't say a line right).
import difflib, io, json, os, re, shutil, subprocess, sys, time
import torch, torchaudio as ta
from chatterbox.tts import ChatterboxTTS
from faster_whisper import WhisperModel

lang = sys.argv[1] if len(sys.argv) > 1 else "en"
here = os.path.dirname(os.path.abspath(__file__))
final = os.path.join(here, "..", "audio", lang)
stage = final + "-novo"
os.makedirs(stage, exist_ok=True)
lines = json.load(io.open(os.path.join(here, f"frases-{lang}.json"), encoding="utf8"))
report_path = os.path.join(stage, "relatorio.json")
done_path = os.path.join(here, f"relatorio-chatterbox-{lang}.json")  # lines already re-recorded in earlier runs
done_before = json.load(io.open(done_path, encoding="utf8")) if os.path.exists(done_path) else {}
report = json.load(io.open(report_path, encoding="utf8")) if os.path.exists(report_path) else {}
report = {**done_before, **report}

# how much feeling: the bracelet's whisper stays soft, everyone else is lively
STYLE = {"af_nicole": (.5, .5)}
LIVELY = (.8, .35)

NUM = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split()
TENS = "_ _ twenty thirty forty fifty sixty seventy eighty ninety".split()
def say_num(n):  # 42 → "forty two", as Whisper writes numbers in digits
    if n < 20: return NUM[n]
    if n < 100: return TENS[n // 10] + ("" if n % 10 == 0 else " " + NUM[n % 10])
    if n < 1000: return NUM[n // 100] + " hundred" + ("" if n % 100 == 0 else " " + say_num(n % 100))
    return str(n)
def words(s):
    s = s.lower().replace("’", "'").replace("-", " ")
    s = re.sub(r"\d+", lambda m: say_num(int(m.group())), s)
    for a, b in (("n't", " not"), ("'re", " are"), ("'m", " am"), ("'ll", " will"), ("'ve", " have"), ("'d", " would"), ("'s", " is")):
        s = s.replace(a, b)  # "where's" and "where is" count as the same
    return re.sub(r"[^a-z0-9 ]+", " ", s).split()
def score(text, heard):
    a, b = words(text), words(heard)
    # Whisper "fixes" the learner's wrong sentences ("I no know" → "I know no"), so the same words in
    # another order also count
    same = sum(min(a.count(w), b.count(w)) for w in set(a)) * 2 / max(1, len(a) + len(b))
    return max(difflib.SequenceMatcher(None, a, b).ratio(), same)

tts = ChatterboxTTS.from_pretrained(device="cuda")
try:
    asr = WhisperModel("base.en", device="cuda", compute_type="float16")
    asr.transcribe(os.path.join(here, "vozes", "af_heart.mp3"))
except Exception:
    asr = WhisperModel("base.en", device="cpu", compute_type="int8")

def record(text, path, seed, ex, cfg):
    torch.manual_seed(seed)
    say = text if re.search(r"[.!?…]$", text) else text + "."  # single words come out steadier with an ending
    wav = tts.generate(say, exaggeration=ex, cfg_weight=cfg)
    tmp = path + ".wav"
    ta.save(tmp, wav, tts.sr)
    # trims the silence at both ends and keeps a short breath of it
    trim = "silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,adelay=60,apad=pad_dur=0.15"
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", tmp, "-af", trim, "-ac", "1", "-b:a", "48k", path], check=True)
    os.remove(tmp)
    segs, _ = asr.transcribe(path, language="en", beam_size=1)
    heard = " ".join(s.text for s in segs).strip()
    dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path], capture_output=True, text=True).stdout or 0)
    sc = score(text, heard)
    if dur > 2.5 + len(text) * .11:  # a long tail of noise or extra words
        sc = min(sc, .5)
    return sc, heard

for f in os.listdir(stage):  # tries left behind by a run that was stopped
    if re.search(r"\.\d\.mp3(\.wav)?$", f):
        os.remove(os.path.join(stage, f))
t0, n = time.time(), 0
by_voice = {}
for ln in lines:
    by_voice.setdefault(ln["voice"], []).append(ln)
for voice, group in by_voice.items():
    todo = [ln for ln in group if ln["key"] not in report]
    if not todo:
        continue
    ex, cfg = STYLE.get(voice, LIVELY)
    tts.prepare_conditionals(os.path.join(here, "vozes", voice + ".mp3"), exaggeration=ex)
    for ln in todo:
        out = os.path.join(stage, ln["key"] + ".mp3")
        if len(words(ln["text"])) <= 2:
            # Chatterbox makes up sounds on one or two words alone, so these keep the calm Kokoro clip
            report[ln["key"]] = {"text": ln["text"], "heard": "", "score": 0, "kept": False, "short": True}
            continue
        best = (-1, "", None)
        for tryn in range(3):
            cand = out + f".{tryn}.mp3"
            sc, heard = record(ln["text"], cand, 1000 + tryn, ex, cfg)
            if sc > best[0]:
                if best[2]:
                    os.remove(best[2])
                best = (sc, heard, cand)
            else:
                os.remove(cand)
            if sc >= .9:
                break
        sc, heard, cand = best
        if sc >= .75:
            os.replace(cand, out)
        else:
            os.remove(cand)  # keeps the old Kokoro clip
        report[ln["key"]] = {"text": ln["text"], "heard": heard, "score": round(sc, 2), "kept": sc >= .75}
        n += 1
        if n % 20 == 0:
            io.open(report_path, "w", encoding="utf8").write(json.dumps(report, ensure_ascii=False, indent=1))
            print(f"{len(report)}/{len(lines)}  {time.time() - t0:.0f}s", flush=True)
io.open(report_path, "w", encoding="utf8").write(json.dumps(report, ensure_ascii=False, indent=1))

# all lines done: the new clips replace the old ones
if all(ln["key"] in report for ln in lines):
    moved = 0
    for f in os.listdir(stage):
        if f.endswith(".mp3"):
            shutil.move(os.path.join(stage, f), os.path.join(final, f)); moved += 1
    shutil.move(report_path, done_path)
    os.rmdir(stage)
    bad = [r for r in report.values() if not r["kept"]]
    print("ok", moved, "regravados,", len(bad), "ficaram com a voz antiga")
