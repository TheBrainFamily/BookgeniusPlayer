import { WebSocketServer } from "ws";
import http from "http";
import path from "path";
import os from "os";

// TODO figure out why this explicit resolve is needed
const root = path.join(os.homedir(), ".smart-whisper");
const models = path.join(root, "models");

import { manager, Whisper } from "smart-whisper";

const BYTES_PER_SAMPLE = 2; // For pcm16le (16-bit PCM), each sample is 2 bytes
const SILENCE_THRESHOLD_DBFS = -50; // dBFS threshold for silence detection

function rmsToDBFS(rms: number): number {
  if (rms === 0) {
    return -Infinity;
  }
  return 20 * Math.log10(rms);
}

function calculateRMS(float32: Float32Array): number {
  let sumOfSquares = 0;
  const numSamplesInThisBuffer = float32.length;

  for (let i = 0; i < numSamplesInThisBuffer; i++) {
    const sample = float32[i];
    sumOfSquares += sample * sample;
  }

  return Math.sqrt(sumOfSquares / numSamplesInThisBuffer);
}

function convertToFloat32(pcmBuffer: Buffer): Float32Array {
  const numSamplesInThisBuffer = pcmBuffer.length / BYTES_PER_SAMPLE;

  const float32 = new Float32Array(numSamplesInThisBuffer);
  for (let i = 0; i < numSamplesInThisBuffer; i++) {
    const sample = pcmBuffer.readInt16LE(i * BYTES_PER_SAMPLE);
    float32[i] = sample / (sample >= 0 ? 32767 : 32768);
  }
  return float32;
}

// Create an HTTP server to attach the WebSocket server to
const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("WebSocket server is running");
});

const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 30310;

console.log(`WebSocket server started on ws://localhost:${PORT}`);

let model: string;
let whisper: Whisper;

wss.on("connection", async (ws) => {
  console.log("Client connected");
  let questionBuffer: Float32Array = new Float32Array(0);
  console.log("Models", manager.list());
  model = await manager.download("base.en");
  console.log("Model downloaded:", model);
  const modelPath = path.resolve(models, model + ".bin");
  whisper = new Whisper(modelPath, { gpu: true });
  console.log("Whisper model initialized:", model);

  ws.on("message", async (message: Buffer | ArrayBuffer | Buffer[]) => {
    let inputBuffer: Buffer;

    if (message instanceof ArrayBuffer) {
      inputBuffer = Buffer.from(message);
    } else if (message instanceof Buffer) {
      inputBuffer = message;
    } else {
      console.error("Received unexpected message type for FFmpeg processing");
      ws.send(JSON.stringify({ error: "Unexpected message type" }));
      return;
    }

    const pcmF32leBuffer = convertToFloat32(inputBuffer);
    const rms = calculateRMS(pcmF32leBuffer);
    const db = rmsToDBFS(rms);
    let text = "";
    if (db > SILENCE_THRESHOLD_DBFS) {
      console.log(`RMS: ${rms}, dBFS: ${db}`);
      const newChunk = new Float32Array(questionBuffer.length + pcmF32leBuffer.length);
      newChunk.set(questionBuffer, 0);
      newChunk.set(pcmF32leBuffer, questionBuffer.length);
      questionBuffer = newChunk;

      const task = await whisper.transcribe(newChunk, { format: "simple", debug_mode: false, language: "en" });
      const results = await task.result;
      text = results.reduce((a: string, t: { text: string }) => a + t.text, "");
      await whisper.free();
    }
    const responseJson = { text, timestamp: new Date().toISOString() };

    console.log("Sending transcription:", responseJson);
    ws.send(JSON.stringify(responseJson));
  });

  ws.on("close", () => {
    console.log("Client disconnected");
  });

  ws.on("error", (error) => {
    console.error("WebSocket error:", error);
  });

  ws.send(JSON.stringify({ message: "Welcome to the WebSocket server!" }));
});

server.listen(PORT, () => {
  console.log(`HTTP server listening on port ${PORT}`);
});
