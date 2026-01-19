const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;

export const splitAudioToWavChunks = async (blob: Blob, chunkSeconds: number) => {
  if (!AudioContextClass) {
    throw new Error('Audio chunking is not supported in this browser.');
  }

  const arrayBuffer = await blob.arrayBuffer();
  const audioContext = new AudioContextClass();
  const decoded: AudioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));

  const totalSeconds = decoded.duration;
  const sampleRate = decoded.sampleRate;
  const numChannels = decoded.numberOfChannels;

  const chunks: Array<{ blob: Blob; startSeconds: number; endSeconds: number; durationSeconds: number }> = [];

  let startSeconds = 0;
  while (startSeconds < totalSeconds) {
    const endSeconds = Math.min(totalSeconds, startSeconds + chunkSeconds);

    const startSample = Math.floor(startSeconds * sampleRate);
    const endSample = Math.floor(endSeconds * sampleRate);
    const frameCount = Math.max(0, endSample - startSample);

    if (frameCount <= 0) break;

    const chunkBuffer = audioContext.createBuffer(numChannels, frameCount, sampleRate);

    for (let channel = 0; channel < numChannels; channel += 1) {
      const slice = decoded.getChannelData(channel).slice(startSample, endSample);
      chunkBuffer.copyToChannel(slice, channel, 0);
    }

    const wavBuffer = encodeWav(chunkBuffer);
    chunks.push({
      blob: new Blob([wavBuffer], { type: 'audio/wav' }),
      startSeconds,
      endSeconds,
      durationSeconds: endSeconds - startSeconds
    });

    startSeconds = endSeconds;
  }

  await audioContext.close();
  return { chunks, totalSeconds };
};

export const offsetTranscriptTimestamps = (text: string, offsetSeconds: number) => {
  if (!text || offsetSeconds <= 0) return text;

  // Supports [MM:SS] and [HH:MM:SS]
  const regex = /\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]/g;

  return text.replace(regex, (_match, a, b, c) => {
    let hours = 0;
    let minutes = 0;
    let seconds = 0;

    if (typeof c === 'string' && c.length > 0) {
      hours = parseInt(a, 10);
      minutes = parseInt(b, 10);
      seconds = parseInt(c, 10);
    } else {
      minutes = parseInt(a, 10);
      seconds = parseInt(b, 10);
    }

    const total = hours * 3600 + minutes * 60 + seconds + offsetSeconds;
    const outH = Math.floor(total / 3600);
    const outM = Math.floor((total % 3600) / 60);
    const outS = total % 60;

    if (outH > 0) {
      return `[${outH.toString().padStart(2, '0')}:${outM.toString().padStart(2, '0')}:${outS.toString().padStart(2, '0')}]`;
    }

    return `[${outM.toString().padStart(2, '0')}:${outS.toString().padStart(2, '0')}]`;
  });
};

const encodeWav = (audioBuffer: AudioBuffer) => {
  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const format = 1;
  const bitsPerSample = 16;

  const samples = audioBuffer.length;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples * blockAlign;

  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  let offset = 0;
  writeString(view, offset, 'RIFF');
  offset += 4;
  view.setUint32(offset, 36 + dataSize, true);
  offset += 4;
  writeString(view, offset, 'WAVE');
  offset += 4;
  writeString(view, offset, 'fmt ');
  offset += 4;
  view.setUint32(offset, 16, true);
  offset += 4;
  view.setUint16(offset, format, true);
  offset += 2;
  view.setUint16(offset, numChannels, true);
  offset += 2;
  view.setUint32(offset, sampleRate, true);
  offset += 4;
  view.setUint32(offset, byteRate, true);
  offset += 4;
  view.setUint16(offset, blockAlign, true);
  offset += 2;
  view.setUint16(offset, bitsPerSample, true);
  offset += 2;
  writeString(view, offset, 'data');
  offset += 4;
  view.setUint32(offset, dataSize, true);
  offset += 4;

  const channelData: Float32Array[] = [];
  for (let channel = 0; channel < numChannels; channel += 1) {
    channelData.push(audioBuffer.getChannelData(channel));
  }

  for (let i = 0; i < samples; i += 1) {
    for (let channel = 0; channel < numChannels; channel += 1) {
      const sample = Math.max(-1, Math.min(1, channelData[channel][i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  return buffer;
};

const writeString = (view: DataView, offset: number, value: string) => {
  for (let i = 0; i < value.length; i += 1) {
    view.setUint8(offset + i, value.charCodeAt(i));
  }
};
