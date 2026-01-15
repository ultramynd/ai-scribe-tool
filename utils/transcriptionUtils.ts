
export const detectDialect = (text: string): boolean => {
  if (!text) return false;
  
  const dialectKeywords = [
    'wahala', 'abeg', 'wetin', 'una', 'sabi', 'don', 'pikin', 'na', 'dey', 
    'abi', 'shebi', 'nna', 'kuku', 'sef', 'sha', 'ogini', 'ba', 'ni', 'ko',
    'mumu', 'gbege', 'yawa', 'comot', 'waka', 'padi', 'omo', 'chook', 'dash',
    'fit', 'go', 'make', 'say', 'we', 'am', 'dem' // careful with common words
  ];

  // More specific pattern matching for "pidgin" structures
  const patterns = [
    /\b(i|we|you|dem) dey\b/i,
    /\b(na) (im|we|me)\b/i,
    /\b(no) (be|go)\b/i,
    /\b(wetin) (dey|happen)\b/i,
  ];

  let score = 0;
  const lowerText = text.toLowerCase();

  // Keyword check
  dialectKeywords.forEach(word => {
    // Only count if word is at least 3 chars or distinctive
    if (word.length > 2) {
       const regex = new RegExp(`\\b${word}\\b`, 'gi');
       const matches = lowerText.match(regex);
       if (matches) score += matches.length;
    }
  });

  // Pattern check (higher weight)
  patterns.forEach(pattern => {
    if (pattern.test(lowerText)) score += 3;
  });

  // Threshold: if score > 3, likely dialect/pidgin
  return score > 3;
};
