class PCMWorkletProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (input && input[0] && input[0].length) {
      // Copy current frame of Float32 samples and transfer to main thread
      const frame = input[0];
      const copy = new Float32Array(frame.length);
      copy.set(frame);
      this.port.postMessage(copy.buffer, [copy.buffer]);
    }
    return true;
  }
}

registerProcessor("pcm-worklet", PCMWorkletProcessor);
