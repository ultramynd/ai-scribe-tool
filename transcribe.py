import os
import sys
import time
import argparse
import subprocess
import tempfile
import warnings
import math
import re

# Suppress the deprecation warning for the old SDK name
warnings.filterwarnings("ignore", category=FutureWarning, module="google.generativeai")

import google.generativeai as genai
from google.generativeai.types import HarmCategory, HarmBlockThreshold

# ---------------------------------------------------------------------------
# CONFIGURATION
# ---------------------------------------------------------------------------

API_KEY = os.environ.get("GEMINI_API_KEY", "YOUR_API_KEY_HERE")
MODEL_NAME = "gemini-2.5-flash"

# Max segment duration in seconds (20 minutes prevents context fatigue and gibberish)
MAX_SEGMENT_SECONDS = 20 * 60

SYSTEM_PROMPT = """
Start now. Transcribe the audio/video file exactly as spoken (100% Verbatim).

RULES:
1. **Speaker Diarization (Strict)**: Identify distinct speakers. Listen for names (e.g., "Hi John") and use them. If names are unknown, assign specific labels like "Speaker 1", "Speaker 2". Consistency is key.
2. **Linguistic Context (Pidgin English & Dialects)**: 
   - The audio likely contains West African English, Nigerian/Ghanaian/Liberian Pidgin, or mixed languages.
   - **Markers**: Look for "wey", "dey", "don", "no be", "sabi", "comot", "abi/shey", "pikin".
   - **CRITICAL**: Transcribe Pidgin EXACTLY as spoken. DO NOT translate to standard English or "correct" the grammar.
3. **Timestamps**: Insert [MM:SS] timestamps at the start of every speaker turn. Use the audio file's native timestamps starting from 00:00.
4. **ABSOLUTE VERBATIM**: Capture EVERY utterance, stutter, false start, and filler word (um, uh, like, you know) exactly where they occur.
5. **NO SUMMARIZATION**: Do NOT summarize. Do NOT omit any parts of the conversation. If they say it, you write it.
6. **Formatting**: Start every speaker turn on a new line.
7. **SILENCE AND HALLUCINATIONS**: If there is silence, background noise, or no one speaking, DO NOT output anything. DO NOT invent dialogue. DO NOT get stuck repeating the same phrase or filler word continuously. If the audio ends, simply stop transcribing.

Output only the transcription. No preamble.
"""

CONTINUATION_PROMPT = """
Continue transcribing. This is Part {part_num} of the same recording.
Maintain the same speaker labels from before. Do NOT repeat any content from the previous segment.

RULES (same as before):
1. **Speaker Diarization (Strict)**: Use the SAME speaker labels from previous segments.
2. **Linguistic Context**: Transcribe Pidgin EXACTLY as spoken.
3. **Timestamps**: Insert [MM:SS] timestamps at the start of every speaker turn. Use the audio file's native timestamps starting from 00:00. (We will add the {offset_minutes} minute offset later, so just transcribe 00:00 to 20:00 relative to this audio chunk).
4. **ABSOLUTE VERBATIM**: Capture EVERY utterance.
5. **NO SUMMARIZATION**: Do NOT omit anything.
6. **Formatting**: Start every speaker turn on a new line.
7. **SILENCE AND HALLUCINATIONS**: If there is silence, background noise, or no one speaking, DO NOT output anything. DO NOT invent dialogue. DO NOT get stuck repeating the same phrase or filler word continuously. If the audio ends, simply stop transcribing.

Output only the transcription. No preamble.
"""

from rich.console import Console
from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn, TimeElapsedColumn
from rich.panel import Panel

console = Console()

# ---------------------------------------------------------------------------
# HELPERS
# ---------------------------------------------------------------------------

def get_duration_seconds(file_path: str) -> float:
    """Get the duration of a media file in seconds using ffprobe."""
    try:
        result = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", file_path],
            capture_output=True, text=True, timeout=30
        )
        return float(result.stdout.strip())
    except Exception:
        return 0

def split_media(file_path: str, segment_seconds: int, temp_dir: str) -> list:
    """Split a media file into segments using ffmpeg."""
    duration = get_duration_seconds(file_path)
    if duration <= 0:
        console.print("[bold red]Error:[/] Could not determine file duration. Is ffmpeg/ffprobe installed?")
        sys.exit(1)

    num_segments = math.ceil(duration / segment_seconds)
    segments = []

    console.print(f"[yellow]File is ~{duration/60:.0f} minutes. Splitting into {num_segments} segments of ~{segment_seconds/60:.0f} min each...[/]")

    for i in range(num_segments):
        start = i * segment_seconds
        out_path = os.path.join(temp_dir, f"segment_{i:03d}.wav")
        cmd = [
            "ffmpeg", "-y", "-i", file_path,
            "-ss", str(start), "-t", str(segment_seconds),
            "-ac", "1", "-ar", "16000",
            "-loglevel", "error",
            out_path
        ]
        subprocess.run(cmd, check=True, timeout=600)
        segments.append((out_path, start))

    return segments

def transcribe_file(file_path: str, prompt: str, progress, task_label: str) -> str:
    """Upload a single file to Gemini and transcribe it."""
    file_size_mb = os.path.getsize(file_path) / (1024 * 1024)
    upload_task = progress.add_task(f"[blue]Uploading {file_size_mb:.1f}MB — {task_label}", total=None)

    try:
        video_file = genai.upload_file(path=file_path)
        progress.update(upload_task, completed=100, total=100, description=f"[green]Upload done — {task_label}[/]")
    except Exception as e:
        progress.stop()
        console.print(f"[bold red]Upload failed:[/] {e}")
        sys.exit(1)

    # Wait for processing
    process_task = progress.add_task(f"[yellow]Processing — {task_label}", total=None)
    while video_file.state.name == "PROCESSING":
        time.sleep(5)
        progress.update(process_task, advance=0)
        video_file = genai.get_file(video_file.name)

    if video_file.state.name == "FAILED":
        progress.stop()
        console.print(f"[bold red]Error:[/] Google failed to process {task_label}.")
        sys.exit(1)

    progress.update(process_task, completed=100, total=100, description=f"[green]Processed — {task_label}[/]")

    # Generate transcription
    gen_task = progress.add_task(f"[magenta]Transcribing — {task_label}", total=None)

    safety_settings = {
        HarmCategory.HARM_CATEGORY_HARASSMENT: HarmBlockThreshold.BLOCK_NONE,
        HarmCategory.HARM_CATEGORY_HATE_SPEECH: HarmBlockThreshold.BLOCK_NONE,
        HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT: HarmBlockThreshold.BLOCK_NONE,
        HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT: HarmBlockThreshold.BLOCK_NONE,
    }

    model = genai.GenerativeModel(model_name=MODEL_NAME)

    retries = 3
    for attempt in range(retries):
        try:
            response = model.generate_content(
                [prompt, video_file],
                safety_settings=safety_settings,
                request_options={"timeout": 1800}
            )
            progress.update(gen_task, completed=100, total=100, description=f"[bold green]Done — {task_label}[/]")
            break
        except Exception as e:
            if attempt < retries - 1:
                progress.update(gen_task, advance=0, description=f"[yellow]Retrying ({attempt+1}/{retries}) in 65s — {task_label}[/]")
                time.sleep(65)
            else:
                progress.stop()
                # Clean up remote file
                try:
                    genai.delete_file(video_file.name)
                except:
                    pass
                raise e

    # Clean up remote file
    try:
        genai.delete_file(video_file.name)
    except:
        pass

    return response.text

def adjust_timestamps(text: str, offset_minutes: int) -> str:
    if offset_minutes == 0:
        return text

    def replacer(match):
        mm = int(match.group(1))
        ss = match.group(2)
        return f"[{mm + offset_minutes:02d}:{ss}]"

    def replacer_ms(match):
        mm = int(match.group(1))
        ss = match.group(2)
        ms = match.group(3)
        return f"[{mm + offset_minutes}m{ss}s{ms}ms]"

    text = re.sub(r'\[(\d+):(\d+)\]', replacer, text)
    text = re.sub(r'\[(\d+)m(\d+)s(\d+)ms\]', replacer_ms, text)
    return text

# ---------------------------------------------------------------------------
# MAIN
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Transcribe large audio/video files using Google Gemini.")
    parser.add_argument("file_path", help="Path to the audio or video file to transcribe.")
    parser.add_argument("-o", "--output", help="Path to the output text file.")

    args = parser.parse_args()
    file_path = args.file_path

    if not os.path.exists(file_path):
        console.print(f"[bold red]Error:[/] File not found: [yellow]{file_path}[/]")
        sys.exit(1)

    if API_KEY == "YOUR_API_KEY_HERE":
        console.print("[bold red]Error:[/] Please set your [cyan]GEMINI_API_KEY[/] environment variable.")
        sys.exit(1)

    output_path = args.output
    if not output_path:
        base_name = os.path.splitext(file_path)[0]
        output_path = f"{base_name}.txt"

    console.print(Panel.fit("[bold cyan]AI Scribe - Local Video Transcription Engine[/]", border_style="cyan"))
    genai.configure(api_key=API_KEY)

    duration = get_duration_seconds(file_path)
    if duration <= MAX_SEGMENT_SECONDS:
        # --- ATTEMPT 1: Try the whole file first ---
        with Progress(
            SpinnerColumn("dots", style="blue"),
            TextColumn("[progress.description]{task.description}"),
            BarColumn(style="blue"),
            TextColumn("[progress.percentage]{task.percentage:>3.0f}%"),
            TimeElapsedColumn(),
            console=console,
        ) as progress:
            try:
                text = transcribe_file(file_path, SYSTEM_PROMPT, progress, "Full File")
                # Success! Save and exit
                console.print(f"\n[bold green]✓[/] Saving transcript to: [bold white]{output_path}[/]")
                with open(output_path, "w", encoding="utf-8") as f:
                    f.write(text)
                console.print(Panel("[bold green]All done! Transcript is ready.[/]", border_style="green"))
                return

            except Exception as e:
                console.print(f"\n[bold red]Transcription failed:[/] {e}")
                sys.exit(1)
    else:
        console.print(f"\n[yellow]⚠ File duration ({duration/60:.1f} mins) exceeds max segment size ({MAX_SEGMENT_SECONDS/60:.1f} mins). Switching to chunked mode...[/]")

    # --- ATTEMPT 2: Chunked transcription with ffmpeg ---
    # Check ffmpeg availability
    try:
        subprocess.run(["ffmpeg", "-version"], capture_output=True, timeout=10)
    except FileNotFoundError:
        console.print("[bold red]Error:[/] [cyan]ffmpeg[/] is required for chunked transcription of large files.")
        console.print("Install it with: [bold]sudo apt-get install -y ffmpeg[/]")
        sys.exit(1)

    with tempfile.TemporaryDirectory() as temp_dir:
        segments = split_media(file_path, MAX_SEGMENT_SECONDS, temp_dir)
        all_text_parts = []

        with Progress(
            SpinnerColumn("dots", style="blue"),
            TextColumn("[progress.description]{task.description}"),
            BarColumn(style="blue"),
            TextColumn("[progress.percentage]{task.percentage:>3.0f}%"),
            TimeElapsedColumn(),
            console=console,
        ) as progress:
            for idx, (seg_path, start_sec) in enumerate(segments):
                part_num = idx + 1
                label = f"Part {part_num}/{len(segments)}"
                console.print(f"\n[bold cyan]── Segment {part_num} of {len(segments)} ──[/]")

                if idx == 0:
                    prompt = SYSTEM_PROMPT
                else:
                    offset_minutes = int(start_sec / 60)
                    prev_end_min = int(start_sec / 60)
                    prev_end_sec = int(start_sec % 60)
                    prompt = CONTINUATION_PROMPT.format(
                        part_num=part_num,
                        prev_end=f"{prev_end_min:02d}:{prev_end_sec:02d}",
                        offset_minutes=offset_minutes
                    )

                try:
                    text = transcribe_file(seg_path, prompt, progress, label)
                    offset_minutes = int(start_sec / 60)
                    text = adjust_timestamps(text, offset_minutes)
                    all_text_parts.append(text)
                except Exception as e:
                    console.print(f"\n[bold red]Segment {part_num} failed:[/] {e}")
                    console.print("[yellow]Saving partial transcript...[/]")
                    break
                    
                if idx < len(segments) - 1:
                    console.print("[yellow]Waiting 30 seconds before next segment to avoid API rate limits...[/]")
                    time.sleep(30)

        # Merge all parts
        full_text = "\n\n".join(all_text_parts)

        console.print(f"\n[bold green]✓[/] Saving transcript to: [bold white]{output_path}[/]")
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(full_text)

        console.print(Panel(f"[bold green]All done! Transcribed {len(all_text_parts)}/{len(segments)} segments.[/]", border_style="green"))


if __name__ == "__main__":
    main()
