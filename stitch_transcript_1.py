import os

def insert_chunks(original_path: str, chunk_paths: list[str], start_time_str: str):
    with open(original_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()
        
    chunk_lines = []
    for cp in chunk_paths:
        if os.path.exists(cp):
            with open(cp, 'r', encoding='utf-8') as f:
                chunk_lines.extend(f.readlines())
        
    # Find the injection point (before the start_time)
    start_idx = -1
    
    # We want to replace everything from 60:00 onwards.
    new_lines = []
    skip = False
    for line in lines:
        if line.startswith(f"[{start_time_str}]") or \
           line.startswith("[60:") or line.startswith("[61:") or line.startswith("[62:") or line.startswith("[63:") or \
           line.startswith("[64:") or line.startswith("[65:") or line.startswith("[66:") or line.startswith("[67:") or \
           line.startswith("[68:") or line.startswith("[69:") or line.startswith("[70:") or line.startswith("[71:") or \
           line.startswith("[72:") or line.startswith("[73:") or line.startswith("[74:") or line.startswith("[75:") or \
           line.startswith("[76:") or line.startswith("[77:") or line.startswith("[78:") or line.startswith("[79:") or \
           line.startswith("[80:") or line.startswith("[81:") or line.startswith("[82:") or line.startswith("[83:") or \
           line.startswith("[84:") or line.startswith("[85:") or line.startswith("[86:") or line.startswith("[87:") or \
           line.startswith("[88:") or line.startswith("[89:") or line.startswith("[90:") or line.startswith("[91:") or \
           line.startswith("[92:") or line.startswith("[93:") or line.startswith("[94:") or line.startswith("[95:") or \
           line.startswith("[96:") or line.startswith("[97:") or line.startswith("[98:") or line.startswith("[99:") or \
           line.startswith("[10") or line.startswith("[11") or line.startswith("[12") or line.startswith("[13"):
            skip = True
            if start_idx == -1:
                start_idx = len(new_lines)
            
        if not skip:
            new_lines.append(line)
            
    if start_idx != -1:
        new_lines = new_lines[:start_idx] + chunk_lines
    else:
        new_lines = new_lines + chunk_lines
        
    out_path = original_path.replace(".txt", "_fixed_final.txt")
    with open(out_path, 'w', encoding='utf-8') as f:
        f.writelines(new_lines)
    print(f"Fixed saved to {out_path}")

def main():
    original = "/mnt/c/Users/kfdos/Downloads/transcriptoins/Done/Follow-Up Interview with Dr MacJohn - 2026_02_11 14_24 WAT - Recording.txt"
    chunks = [
        "/mnt/c/Users/kfdos/Downloads/transcriptoins/Done/Follow-Up Interview with Dr MacJohn - 2026_02_11 14_24 WAT - Recording_segment_4_adjusted.txt",
        "/mnt/c/Users/kfdos/Downloads/transcriptoins/Done/Follow-Up Interview with Dr MacJohn - 2026_02_11 14_24 WAT - Recording_segment_5_adjusted.txt",
        "/mnt/c/Users/kfdos/Downloads/transcriptoins/Done/Follow-Up Interview with Dr MacJohn - 2026_02_11 14_24 WAT - Recording_segment_6_adjusted.txt",
        "/mnt/c/Users/kfdos/Downloads/transcriptoins/Done/Follow-Up Interview with Dr MacJohn - 2026_02_11 14_24 WAT - Recording_segment_7_adjusted.txt"
    ]
    insert_chunks(original, chunks, "60:00")

if __name__ == "__main__":
    main()
