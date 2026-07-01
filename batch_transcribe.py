import os
import subprocess

directory = "/mnt/c/Users/kfdos/Downloads/transcriptoins"
files_to_process = [
    "Interview with Dr MacJohn_8.mp3",
    "Interview with Dr MacJohn_9.mp3",
    "Interview with Dr MacJohn_10.mp3"
]

def main():
    for f in files_to_process:
        mp3_path = os.path.join(directory, f)
        txt_path = os.path.splitext(mp3_path)[0] + ".txt"
        
        if os.path.exists(txt_path) and os.path.getsize(txt_path) > 1000:
            print(f"Skipping {f}, transcript already exists.")
            continue
            
        print(f"\n======================================")
        print(f"Starting transcription for {f}")
        print(f"======================================\n")
        
        subprocess.run(["python3", "transcribe.py", mp3_path], cwd="/home/ultramynd/Projects/ai-scribe-tool")

if __name__ == "__main__":
    main()
