export const trimAudioBlob = async (blob: Blob, startSec: number, endSec: number) => {
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) {
    throw new Error('Audio trimming is not supported in this browser.');
  }

  const arrayBuffer = await blob.arrayBuffer();
  const audioContext = new AudioContextClass();
  const decoded = await audioContext.decodeAudioData(arrayBuffer.slice(0));

  const sampleRate = decoded.sampleRate;
  const startSample = Math.max(0, Math.floor(startSec * sampleRate));
  const endSample = Math.min(decoded.length, Math.floor(endSec * sampleRate));
  const frameCount = Math.max(0, endSample - startSample);

  if (frameCount === 0) {
    audioContext.close();
    throw new Error('Trim range is too small.');
  }

  const trimmed = audioContext.createBuffer(decoded.numberOfChannels, frameCount, sampleRate);

  for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) {
    const channelData = decoded.getChannelData(channel).slice(startSample, endSample);
    trimmed.copyToChannel(channelData, channel, 0);
  }

  const wavBuffer = encodeWav(trimmed);
  await audioContext.close();
  return new Blob([wavBuffer], { type: 'audio/wav' });
};

const encodeWav = (audioBuffer: AudioBuffer) => {
  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const format = 1;
  const bitsPerSample = 16;

  const samples = audioBuffer.length;
  const blockAlign = numChannels * bitsPerSample / 8;
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
