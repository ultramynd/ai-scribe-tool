import os
import sys
import time
import argparse
import google.generativeai as genai
from google.generativeai.types import HarmCategory, HarmBlockThreshold

# ---------------------------------------------------------------------------
# CONFIGURATION
# ---------------------------------------------------------------------------

# Set your API Key here, or export it in your terminal as GEMINI_API_KEY
# Example: export GEMINI_API_KEY="your_actual_api_key_here"
API_KEY = os.environ.get("GEMINI_API_KEY", "YOUR_API_KEY_HERE")

# The Gemini model to use. 
# gemini-2.5-flash is free and incredibly fast/accurate for transcription.
MODEL_NAME = "gemini-2.5-flash"

# Instructions describing exactly what we want Gemini to do.
# This ensures it labels speakers, captures verbatim text, and handles Pidgin.
SYSTEM_PROMPT = """
Start now. Transcribe the audio/video file exactly as spoken (100% Verbatim).

RULES:
1. **Speaker Diarization (Strict)**: Identify distinct speakers. Listen for names (e.g., "Hi John") and use them. If names are unknown, assign specific labels like "Speaker 1", "Speaker 2". Consistency is key.
2. **Linguistic Context (Pidgin English & Dialects)**: 
   - The audio likely contains West African English, Nigerian/Ghanaian/Liberian Pidgin, or mixed languages.
   - **Markers**: Look for "wey", "dey", "don", "no be", "sabi", "comot", "abi/shey", "pikin".
   - **CRITICAL**: Transcribe Pidgin EXACTLY as spoken. DO NOT translate to standard English or "correct" the grammar.
3. **Timestamps**: Insert [MM:SS] timestamps at the start of every speaker turn.
4. **ABSOLUTE VERBATIM**: Capture EVERY utterance, stutter, false start, and filler word (um, uh, like, you know) exactly where they occur.
5. **NO SUMMARIZATION**: Do NOT summarize. Do NOT omit any parts of the conversation. If they say it, you write it.
6. **Formatting**: Start every speaker turn on a new line.

Output only the transcription. No preamble.
"""

from rich.console import Console
from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn, TimeElapsedColumn
from rich.panel import Panel
from rich.live import Live

console = Console()

# ---------------------------------------------------------------------------
# MAIN SCRIPT
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

    video_file = None
    
    with Progress(
        SpinnerColumn("dots", style="blue"),
        TextColumn("[progress.description]{task.description}"),
        BarColumn(style="blue"),
        TextColumn("[progress.percentage]{task.percentage:>3.0f}%"),
        TimeElapsedColumn(),
        console=console,
    ) as progress:
        
        # --- PHASE 1: UPLOAD ---
        file_size_mb = os.path.getsize(file_path) / (1024 * 1024)
        upload_task = progress.add_task(f"[blue]Uploading {file_size_mb:.1f}MB to Gemini Storage...", total=None)
        
        try:
            video_file = genai.upload_file(path=file_path)
            progress.update(upload_task, completed=100, total=100, description="[green]Upload complete![/]")
        except Exception as e:
            progress.stop()
            console.print(f"[bold red]Upload failed:[/] {e}")
            sys.exit(1)
            
        # --- PHASE 2: PROCESSING ---
        process_task = progress.add_task("[yellow]Google Processing Video Track...", total=None)
        
        while video_file.state.name == "PROCESSING":
            time.sleep(5)
            # Update the animation
            progress.update(process_task, advance=0) 
            video_file = genai.get_file(video_file.name)
            
        if video_file.state.name == "FAILED":
            progress.stop()
            console.print("[bold red]Error:[/] Google failed to process the video file.")
            sys.exit(1)
            
        progress.update(process_task, completed=100, total=100, description="[green]Processing complete![/]")
        
        # --- PHASE 3: GENERATION ---
        gen_task = progress.add_task(f"[magenta]Transcribing with {MODEL_NAME} (this takes minutes)...", total=None)
        
        safety_settings = {
            HarmCategory.HARM_CATEGORY_HARASSMENT: HarmBlockThreshold.BLOCK_NONE,
            HarmCategory.HARM_CATEGORY_HATE_SPEECH: HarmBlockThreshold.BLOCK_NONE,
            HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT: HarmBlockThreshold.BLOCK_NONE,
            HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT: HarmBlockThreshold.BLOCK_NONE,
        }

        model = genai.GenerativeModel(model_name=MODEL_NAME)
        
        try:
            response = model.generate_content(
                [SYSTEM_PROMPT, video_file],
                safety_settings=safety_settings,
                request_options={"timeout": 1800} # 30 mins
            )
            progress.update(gen_task, completed=100, total=100, description="[bold green]Transcription complete![/]")
        except Exception as e:
            progress.stop()
            console.print(f"\n[bold red]Transcription failed:[/] {e}")
            if video_file: genai.delete_file(video_file.name)
            sys.exit(1)

    # --- SAVE ---
    console.print(f"\n[bold green]✓[/] Saving transcript to: [bold white]{output_path}[/]")
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(response.text)
        
    console.print("[bold green]✓[/] Cleaning up cloud storage...")
    genai.delete_file(video_file.name)
    
    console.print(Panel("[bold green]All done! Transcript is ready.[/]", border_style="green"))

if __name__ == "__main__":
    main()
