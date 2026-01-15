import { Document, Packer, Paragraph, TextRun } from "docx";

/**
 * Triggers a browser download for a given Blob.
 */
export const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

/**
 * Generates a plain text file.
 */
export const generateTxt = (text: string, filename: string) => {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  downloadBlob(blob, `${filename}.txt`);
};

/**
 * Generates a Word-compatible HTML file (saved as .doc).
 */
export const generateDoc = (text: string, filename: string) => {
  // Simple conversion of Markdown bold/italic to HTML
  const htmlBody = text
    .replace(/\n/g, '<br/>')
    .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
    .replace(/__(.*?)__/g, '<b>$1</b>')
    .replace(/\*(.*?)\*/g, '<i>$1</i>')
    .replace(/_(.*?)_/g, '<i>$1</i>');

  const content = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <meta charset='utf-8'>
        <title>${filename}</title>
        <style>
          body { font-family: 'Calibri', sans-serif; font-size: 11pt; line-height: 1.5; }
        </style>
      </head>
      <body>${htmlBody}</body>
    </html>
  `;
  
  const blob = new Blob([content], { type: 'application/msword' });
  downloadBlob(blob, `${filename}.doc`);
};

/**
 * Generates a proper .docx file using the docx library.
 */
export const generateDocx = async (text: string, filename: string) => {
  try {
    const lines = text.split('\n');
    const children = [];

    for (const line of lines) {
      if (!line.trim()) {
        children.push(new Paragraph({ children: [new TextRun("")] })); 
        continue;
      }

      // Robust regex to capture bold (** or __) and italic (* or _)
      // 1. **bold** or __bold__
      // 2. *italic* or _italic_
      const parts = line.split(/(\*\*.*?\*\*|__.*?__|(?<!\*)\*.*?\*(?!\*)|(?<!_)_.*?_(?!_))/g);
      
      const textRuns = parts.map(part => {
          if (!part) return null;
          
          // Bold matches
          if ((part.startsWith('**') && part.endsWith('**')) || (part.startsWith('__') && part.endsWith('__'))) {
              return new TextRun({
                  text: part.slice(2, -2),
                  bold: true,
              });
          }
          
          // Italic matches
          if ((part.startsWith('*') && part.endsWith('*')) || (part.startsWith('_') && part.endsWith('_'))) {
              return new TextRun({
                  text: part.slice(1, -1),
                  italics: true,
              });
          }
          
          return new TextRun({ text: part });
      }).filter(Boolean) as TextRun[];

      children.push(new Paragraph({
        children: textRuns,
        spacing: { after: 120 },
      }));
    }

    const doc = new Document({
      sections: [{
        properties: {},
        children: children,
      }],
    });

    const blob = await Packer.toBlob(doc);
    downloadBlob(blob, `${filename}.docx`);
  } catch (error) {
    console.error("DOCX generation error:", error);
    throw error;
  }
};

/**
 * Parses text for [MM:SS] or [HH:MM:SS] timestamps and generates an SRT file.
 */
export const generateSrt = (text: string, filename: string) => {
  const lines = text.split('\n');
  let srtContent = '';
  let counter = 1;

  const timeRegex = /\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const match = line.match(timeRegex);
    if (match) {
      // Extract time parts
      let hours = 0;
      let minutes = parseInt(match[1]);
      let seconds = parseInt(match[2]);
      
      // Handle [HH:MM:SS] vs [MM:SS]
      if (match[3]) {
        hours = parseInt(match[1]);
        minutes = parseInt(match[2]);
        seconds = parseInt(match[3]);
      }

      // Format Start Time: HH:MM:SS,000
      const startTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')},000`;

      // Estimate End Time (arbitrary +3 seconds or until next timestamp if we implemented lookahead, but +3s is a safe default for reading)
      // A better approach is to assume the chunk lasts until the next timestamp or 4 seconds.
      const endDate = new Date(0, 0, 0, hours, minutes, seconds + 4); 
      const endH = endDate.getHours().toString().padStart(2, '0');
      const endM = endDate.getMinutes().toString().padStart(2, '0');
      const endS = endDate.getSeconds().toString().padStart(2, '0');
      const endTime = `${endH}:${endM}:${endS},000`;

      // Clean text (remove timestamp from content)
      const content = line.replace(timeRegex, '').trim();

      srtContent += `${counter}\n${startTime} --> ${endTime}\n${content}\n\n`;
      counter++;
    }
  }

  if (srtContent === '') {
    alert("No timestamps found in the format [MM:SS] to generate subtitles.");
    return;
  }

  const blob = new Blob([srtContent], { type: 'text/srt' });
  downloadBlob(blob, `${filename}.srt`);
};