import os
import sys
import tempfile
import google.generativeai as genai
from google.generativeai.types import HarmCategory, HarmBlockThreshold
from transcribe import split_media, transcribe_file, adjust_timestamps, SYSTEM_PROMPT, CONTINUATION_PROMPT, API_KEY, MODEL_NAME
from rich.console import Console
from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn, TimeElapsedColumn

console = Console()

def main():
    if len(sys.argv) < 3:
        console.print("Usage: python re_transcribe.py <file_path> <start_chunk_number>")
        console.print("Example: python re_transcribe.py video.mp4 3")
        return
    file_path = sys.argv[1]
    start_chunk = int(sys.argv[2])
    
    if not os.path.exists(file_path):
        console.print("File not found")
        return

    if API_KEY == "YOUR_API_KEY_HERE":
        console.print("[bold red]Error:[/] Please set your [cyan]GEMINI_API_KEY[/] environment variable or edit transcribe.py.")
        return

    genai.configure(api_key=API_KEY)
    
    MAX_SEGMENT_SECONDS = 20 * 60
    
    with tempfile.TemporaryDirectory() as temp_dir:
        segments = split_media(file_path, MAX_SEGMENT_SECONDS, temp_dir)
        target_indices = list(range(start_chunk - 1, len(segments)))
        
        if not target_indices:
            console.print("Start chunk is greater than total chunks.")
            return

        with Progress(
            SpinnerColumn("dots", style="blue"),
            TextColumn("[progress.description]{task.description}"),
            BarColumn(style="blue"),
            TextColumn("[progress.percentage]{task.percentage:>3.0f}%"),
            TimeElapsedColumn(),
            console=console,
        ) as progress:
            for idx in target_indices:
                if idx >= len(segments):
                    break
                seg_path, start_sec = segments[idx]
                part_num = idx + 1
                label = f"Part {part_num}/{len(segments)}"
                console.print(f"\n[bold cyan]── Segment {part_num} of {len(segments)} ──[/]")
                
                offset_minutes = int(start_sec / 60)
                prev_end_min = int(start_sec / 60)
                prev_end_sec = int(start_sec % 60)
                
                if idx == 0:
                    prompt = SYSTEM_PROMPT
                else:
                    prompt = CONTINUATION_PROMPT.format(
                        part_num=part_num,
                        prev_end=f"{prev_end_min:02d}:{prev_end_sec:02d}",
                        offset_minutes=offset_minutes
                    )

                try:
                    text = transcribe_file(seg_path, prompt, progress, label)
                    
                    # Log the output to a file so we can inspect it before merging
                    base_name = os.path.splitext(os.path.basename(file_path))[0]
                    out_part_path = f"{base_name}_segment_{part_num}_raw.txt"
                    with open(out_part_path, "w", encoding="utf-8") as f:
                        f.write(text)
                    
                    text_adjusted = adjust_timestamps(text, offset_minutes)
                    with open(f"{base_name}_segment_{part_num}_adjusted.txt", "w", encoding="utf-8") as f:
                        f.write(text_adjusted)
                        
                    console.print(f"Saved segment {part_num} to {out_part_path}")
                except Exception as e:
                    console.print(f"Segment {part_num} failed: {e}")

if __name__ == "__main__":
    main()
