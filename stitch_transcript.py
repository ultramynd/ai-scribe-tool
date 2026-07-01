import os

def insert_chunk(original_path: str, chunk_path: str, start_time_str: str, end_time_str: str):
    with open(original_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()
        
    with open(chunk_path, 'r', encoding='utf-8') as f:
        chunk_lines = f.readlines()
        
    # Find the injection point (before the start_time, after end_time)
    start_idx = -1
    end_idx = -1
    
    for i, line in enumerate(lines):
        if line.startswith(f"[{start_time_str}]"):
            if start_idx == -1:
                # the chunk replaces hallucination starting roughly around 40:00 to 60:00
                pass
                
    # Since we know the chunk is from 40 to 60 mins... Let's just strip everything from [40:xx] to [60:xx] and insert the chunk there
    new_lines = []
    skip = False
    for line in lines:
        if line.startswith("[40:") or line.startswith("[41:") or line.startswith("[42:") or line.startswith("[43:") or \
           line.startswith("[44:") or line.startswith("[45:") or line.startswith("[46:") or line.startswith("[47:") or \
           line.startswith("[48:") or line.startswith("[49:") or line.startswith("[50:") or line.startswith("[51:") or \
           line.startswith("[52:") or line.startswith("[53:") or line.startswith("[54:") or line.startswith("[55:") or \
           line.startswith("[56:") or line.startswith("[57:") or line.startswith("[58:") or line.startswith("[59:"):
            skip = True
            if start_idx == -1:
                start_idx = len(new_lines)
        elif line.startswith("[60:") or line.startswith("[61:"):
            skip = False
            
        if not skip:
            new_lines.append(line)
            
    if start_idx != -1:
        new_lines = new_lines[:start_idx] + chunk_lines + new_lines[start_idx:]
        
    out_path = original_path.replace(".txt", "_fixed.txt")
    with open(out_path, 'w', encoding='utf-8') as f:
        f.writelines(new_lines)
    print(f"Fixed saved to {out_path}")

def main():
    original = "/mnt/c/Users/kfdos/Downloads/transcriptoins/Done 2/Interview with Dr MacJohn_7 (Pt 2).txt"
    chunk = "/mnt/c/Users/kfdos/Downloads/transcriptoins/Done 2/chunk3_adjusted.txt"
    insert_chunk(original, chunk, "40:00", "60:00")

if __name__ == "__main__":
    main()
