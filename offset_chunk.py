import os
import re

def adjust_timestamps(text: str, offset_minutes: int) -> str:
    if offset_minutes == 0: return text
    def replacer(match):
        mm = int(match.group(1))
        ss = match.group(2)
        return f"[{mm + offset_minutes:02d}:{ss}]"
    
    def replacer_ms(match):
        mm = int(match.group(1))
        ss = match.group(2)
        ms = match.group(3)
        return f"[{mm + offset_minutes}m{ss}s{ms}ms]"
        
    text = re.sub(r"\[(\d+):(\d+)\]", replacer, text)
    text = re.sub(r"\[(\d+)m(\d+)s(\d+)ms\]", replacer_ms, text)
    return text

def main():
    chunk3_path = "/mnt/c/Users/kfdos/Downloads/transcriptoins/Done 2/chunk3.txt"
    if os.path.exists(chunk3_path):
        with open(chunk3_path, "r", encoding="utf-8") as f:
            text = f.read()
        adjusted = adjust_timestamps(text, 40)
        out_path = "/mnt/c/Users/kfdos/Downloads/transcriptoins/Done 2/chunk3_adjusted.txt"
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(adjusted)
        print("Adjusted chunk 3")

if __name__ == "__main__":
    main()
