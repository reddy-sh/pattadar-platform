#!/usr/bin/env python3
"""Render original, captioned record-literacy videos from recordGuides.json.

The diagrams are fictional teaching examples. Government pages are cited in the
University record library, not reproduced in the video frames.
Requires Pillow, ffmpeg/ffprobe, Kokoro, soundfile, and the English spaCy model.
Kokoro's Apache-licensed model is used only while rendering; its weights are
not shipped to the website.
"""

from __future__ import annotations

import json
import math
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf
from PIL import Image, ImageDraw, ImageFont
from kokoro import KPipeline


ROOT = Path(__file__).resolve().parents[1]
GUIDES = json.loads((ROOT / "src/data/recordGuides.json").read_text())
OUT = ROOT / "public/record-videos"
VOICE = os.environ.get("PATTADAR_VIDEO_VOICE", "af_heart")
FONT_DIR = Path("/System/Library/Fonts/Supplemental")
W, H = 1600, 900
NAVY = "#102a34"
PAPER = "#f9f4eb"
INK = "#18313a"
RUST = "#bc5924"
SAGE = "#d7e5d7"
MUTED = "#a8bdc0"
_pipeline: KPipeline | None = None


def speech_text(value: str) -> str:
    """Expand record shorthand for clearer speech and matching captions."""
    replacements = {
        r"\bePPB\b": "electronic Pattadar passbook",
        r"\bROR\b": "record of rights",
        r"\b1-B\b": "one B",
        r"\bFMB\b": "field measurement book",
        r"\bRSR\b": "re settlement register",
        r"\bEC\b": "encumbrance certificate",
        r"\bQR\b": "Q R",
        r"\bLPM\b": "land parcel map",
        r"\bSRO\b": "sub registrar office",
        r"\bBhuNaksha\b": "Bhu Naksha",
    }
    for pattern, replacement in replacements.items():
        value = re.sub(pattern, replacement, value)
    return value


def pronunciation_text(value: str) -> str:
    """Keep official spelling in captions while guiding local-name speech."""
    value = speech_text(value)
    for pattern, phonemes in (
        (r"\bBhu Bharati\b", "bˈuː bɑːɹˈɑːti"),
        (r"\bPattadar\b", "pətˈɑːdɑːɹ"),
        (r"\bkhata\b", "kˈɑːtɑː"),
    ):
        value = re.sub(pattern, lambda match: f"[{match.group()}](/{phonemes}/)", value)
    return value


def synthesize(narration: str, destination: Path) -> None:
    global _pipeline
    if _pipeline is None:
        _pipeline = KPipeline(lang_code="a", repo_id="hexgrad/Kokoro-82M")
    chunks = [result.audio.numpy() for result in _pipeline(pronunciation_text(narration), voice=VOICE, speed=0.94)]
    if not chunks:
        raise RuntimeError(f"No narration generated for: {narration}")
    sf.write(destination, np.concatenate(chunks), 24000)


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONT_DIR / ("Arial Bold.ttf" if bold else "Arial.ttf")), size)


def wrap(draw: ImageDraw.ImageDraw, value: str, max_width: int, face: ImageFont.FreeTypeFont) -> list[str]:
    words = value.split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = (current + " " + word).strip()
        if current and draw.textlength(candidate, font=face) > max_width:
            lines.append(current)
            current = word
        else:
            current = candidate
    if current:
        lines.append(current)
    return lines


def text_block(draw: ImageDraw.ImageDraw, value: str, xy: tuple[int, int], width: int,
               size: int, fill: str, bold: bool = False, spacing: int = 13,
               max_lines: int | None = None) -> int:
    face = font(size, bold)
    lines = wrap(draw, value, width, face)
    if max_lines is not None and len(lines) > max_lines:
        raise ValueError(f"Text will clip ({len(lines)} > {max_lines}): {value}")
    x, y = xy
    for line in lines:
        draw.text((x, y), line, font=face, fill=fill)
        y += size + spacing
    return y


def base(guide: dict, chapter: int) -> tuple[Image.Image, ImageDraw.ImageDraw]:
    im = Image.new("RGB", (W, H), NAVY)
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((50, 42, 1550, 858), radius=30, outline="#37505a", width=2)
    d.rounded_rectangle((80, 73, 234, 125), radius=22, fill=RUST)
    d.text((107, 84), guide["stateCode"], font=font(28, True), fill="#ffffff")
    d.text((262, 84), "PATTADAR UNIVERSITY  /  RECORD LAB", font=font(23, True), fill=PAPER)
    d.text((106, 806), "FICTIONAL TRAINING EXAMPLE  ·  NOT A GOVERNMENT RECORD", font=font(20, True), fill=MUTED)
    for index in range(4):
        d.rounded_rectangle((1190 + index * 77, 809, 1256 + index * 77, 818), radius=5,
                            fill=RUST if index <= chapter else "#4b6067")
    return im, d


def page_icon(d: ImageDraw.ImageDraw, guide: dict, x: int, y: int) -> None:
    graphic = guide["graphic"]
    d.rounded_rectangle((x, y, x + 592, y + 626), radius=28, fill=PAPER)
    d.rounded_rectangle((x + 30, y + 31, x + 562, y + 92), radius=15, fill=INK)
    d.text((x + 53, y + 47), "TRAINING SAMPLE", font=font(22, True), fill="#ffffff")
    if graphic == "map":
        pts = [(x + 115, y + 182), (x + 353, y + 150), (x + 478, y + 285),
               (x + 411, y + 468), (x + 152, y + 492), (x + 88, y + 316)]
        d.line([(x + 75, y + 206), (x + 492, y + 502)], fill="#91a7a8", width=25)
        d.polygon(pts, fill="#d9e9df", outline=RUST, width=7)
        for px, py in pts:
            d.ellipse((px - 8, py - 8, px + 8, py + 8), fill=RUST)
        d.text((x + 220, y + 299), "42/2", font=font(42, True), fill=INK)
        d.text((x + 64, y + 554), "SURVEY  ·  SCALE  ·  NEIGHBOURS", font=font(20, True), fill=INK)
    elif graphic == "timeline":
        d.line((x + 95, y + 310, x + 490, y + 310), fill=RUST, width=8)
        for i, (yr, lab) in enumerate((("OLD", "source"), ("ORDER", "change"), ("NOW", "record"))):
            px = x + 110 + i * 190
            d.ellipse((px - 19, y + 291, px + 19, y + 329), fill=RUST)
            d.text((px - 47, y + 245), yr, font=font(21, True), fill=INK)
            d.text((px - 47, y + 353), lab, font=font(20), fill=INK)
        d.rounded_rectangle((x + 58, y + 474, x + 534, y + 550), radius=13, fill=SAGE)
        d.text((x + 83, y + 494), "Keep every link and date", font=font(25, True), fill=INK)
    else:
        if graphic == "passbook":
            d.rounded_rectangle((x + 92, y + 142, x + 497, y + 526), radius=23, fill="#e9d9bb", outline=RUST, width=5)
            d.rectangle((x + 91, y + 142, x + 111, y + 526), fill=RUST)
            d.text((x + 145, y + 187), "PATTADAR", font=font(30, True), fill=INK)
            d.text((x + 145, y + 224), "PASSBOOK", font=font(40, True), fill=INK)
            for i in range(4):
                d.rounded_rectangle((x + 145, y + 302 + i * 42, x + 446, y + 318 + i * 42), radius=8,
                                    fill="#b9c9c1" if i % 2 else "#d1ddd4")
        else:
            d.rounded_rectangle((x + 68, y + 160, x + 524, y + 514), radius=15, fill="#ffffff", outline="#b2c6c3", width=3)
            d.rectangle((x + 68, y + 160, x + 524, y + 215), fill=SAGE)
            for i in range(5):
                yy = y + 235 + i * 54
                d.line((x + 86, yy, x + 505, yy), fill="#9db4b2", width=2)
                d.rounded_rectangle((x + 95, yy + 15, x + 260, yy + 31), radius=5, fill="#c4d5cd")
                d.rounded_rectangle((x + 288, yy + 15, x + 476, yy + 31), radius=5, fill="#e4eae2")
        d.text((x + 70, y + 557), "ACCOUNT  ·  PARCEL  ·  DATE", font=font(22, True), fill=INK)


def draw_cover(guide: dict) -> Image.Image:
    im, d = base(guide, 0)
    d.text((105, 170), guide["kind"].upper(), font=font(25, True), fill="#d79468")
    y = text_block(d, guide["title"], (105, 220), 650, 63, PAPER, True, 8, 3)
    d.rounded_rectangle((105, y + 24, 178, y + 34), radius=5, fill=RUST)
    text_block(d, guide["summary"], (105, y + 77), 640, 30, "#dbe8e7", False, 13, 5)
    page_icon(d, guide, 889, 149)
    return im


def draw_fields(guide: dict, chapter: int) -> Image.Image:
    im, d = base(guide, chapter)
    start = 0 if chapter == 1 else 3
    fields = guide["fields"][start:start + 3]
    d.text((105, 165), f"READ THE FIELDS  /  {start + 1:02d}–{start + len(fields):02d}",
           font=font(25, True), fill="#d79468")
    d.text((105, 211), guide["shortTitle"], font=font(59, True), fill=PAPER)
    d.rounded_rectangle((842, 165, 1486, 740), radius=25, fill=PAPER)
    d.text((887, 193), "FICTIONAL EXTRACT", font=font(22, True), fill=RUST)
    for i, field in enumerate(fields):
        yy = 285 + i * 153
        number = start + i + 1
        d.rounded_rectangle((105, yy, 792, yy + 125), radius=19, fill="#1b3b43", outline="#426069", width=2)
        d.ellipse((133, yy + 26, 183, yy + 76), fill=RUST)
        d.text((149, yy + 34), str(number), font=font(24, True), fill="#ffffff")
        d.text((208, yy + 20), field["label"], font=font(27, True), fill=PAPER)
        text_block(d, field["meaning"], (208, yy + 61), 545, 21, "#d3e3e1", False, 5, 2)
        d.rounded_rectangle((882, yy, 1443, yy + 119), radius=15, fill="#ffffff", outline="#d2dcd4", width=2)
        d.text((910, yy + 17), field["label"].upper(), font=font(17, True), fill=RUST)
        text_block(d, field["example"], (910, yy + 52), 505, 26, INK, True, 5, 2)
    return im


def draw_check(guide: dict) -> Image.Image:
    im, d = base(guide, 3)
    d.text((105, 170), "THE CHECK THAT MATTERS", font=font(25, True), fill="#d79468")
    y = text_block(d, "Compare the layers.", (105, 224), 700, 64, PAPER, True, 8, 2)
    text_block(d, guide["limit"], (105, y + 50), 630, 29, "#dbe8e7", False, 14, 5)
    labels = [("01", "REVENUE", "Holder and use"), ("02", "REGISTRATION", "Deeds and EC"),
              ("03", "SURVEY", "Shape and extent")]
    for i, (num, title, caption) in enumerate(labels):
        yy = 185 + i * 173
        d.rounded_rectangle((857, yy, 1489, yy + 137), radius=20, fill=PAPER)
        d.rounded_rectangle((880, yy + 22, 950, yy + 82), radius=15, fill=RUST)
        d.text((896, yy + 34), num, font=font(26, True), fill="#ffffff")
        d.text((982, yy + 22), title, font=font(25, True), fill=INK)
        d.text((982, yy + 66), caption, font=font(24), fill="#486066")
    d.rounded_rectangle((105, 661, 773, 740), radius=18, fill="#285349")
    d.text((132, 684), "STOP AT A CONFLICT.  SEEK REVIEW.", font=font(23, True), fill=PAPER)
    return im


def run(args: list[str]) -> None:
    subprocess.run(args, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)


def seconds(media: Path) -> float:
    return float(subprocess.check_output([
        "ffprobe", "-v", "error", "-show_entries", "format=duration", "-of",
        "default=nokey=1:noprint_wrappers=1", str(media)], text=True).strip())


def timestamp(t: float) -> str:
    ms = round(t * 1000)
    hours, ms = divmod(ms, 3_600_000)
    minutes, ms = divmod(ms, 60_000)
    secs, ms = divmod(ms, 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d}.{ms:03d}"


def render(guide: dict) -> None:
    destination = OUT / guide["stateCode"]
    destination.mkdir(parents=True, exist_ok=True)
    slug = guide["slug"]
    with tempfile.TemporaryDirectory(prefix=f"record-video-{slug}-") as scratch:
        temp = Path(scratch)
        images = [draw_cover(guide), draw_fields(guide, 1), draw_fields(guide, 2), draw_check(guide)]
        images[0].resize((1280, 720), Image.Resampling.LANCZOS).save(
            destination / f"{slug}.jpg", quality=86, optimize=True)
        parts: list[Path] = []
        cues: list[tuple[float, float, str]] = []
        elapsed = 0.0
        for index, (frame, narration) in enumerate(zip(images, guide["videoTakeaways"], strict=True)):
            png = temp / f"frame-{index}.png"
            audio = temp / f"voice-{index}.wav"
            segment = temp / f"segment-{index}.mp4"
            frame.save(png, optimize=True)
            synthesize(narration, audio)
            duration = math.ceil((seconds(audio) + 0.9) * 24) / 24
            # A small zoom gives the graphic motion while captions and narrated
            # chapters keep the lesson understandable with or without sound.
            run(["ffmpeg", "-y", "-loglevel", "error", "-loop", "1", "-framerate", "24",
                 "-i", str(png), "-i", str(audio), "-vf",
                 "zoompan=z='min(zoom+0.00025,1.035)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1280x720:fps=24,format=yuv420p",
                 "-af", "apad=pad_dur=1", "-t", f"{duration:.3f}", "-c:v", "libx264",
                 "-preset", "veryfast", "-crf", "27", "-c:a", "aac", "-b:a", "96k",
                 "-movflags", "+faststart", str(segment)])
            parts.append(segment)
            cues.append((elapsed, elapsed + duration, speech_text(narration)))
            elapsed += duration
        concat = temp / "concat.txt"
        concat.write_text("".join(f"file '{part}'\n" for part in parts))
        run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i",
             str(concat), "-c", "copy", "-movflags", "+faststart", str(destination / f"{slug}.mp4")])
        (destination / f"{slug}.vtt").write_text(
            "WEBVTT\n\n" + "\n\n".join(
                f"{timestamp(start)} --> {timestamp(end)}\n{line}" for start, end, line in cues
            ) + "\n")
        (destination / f"{slug}.txt").write_text(
            f"{guide['title']} | Pattadar University | {guide['stateCode']}\n"
            "Fictional training example. Not a government record.\n\n"
            + "\n\n".join(line for _, _, line in cues) + "\n\n"
            + "Official sources and field-by-field notes: see the University record guide.\n")
    print(f"{guide['stateCode']}/{slug}: {elapsed:.1f}s")


if __name__ == "__main__":
    for item in GUIDES:
        if len(sys.argv) == 1 or item["slug"] in sys.argv[1:]:
            render(item)
