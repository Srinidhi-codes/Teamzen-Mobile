import * as ImageManipulator from "expo-image-manipulator";
import jpeg from "jpeg-js";
import { decode as decodeBase64 } from "base-64";

/** Keep in sync with frontend/lib/face/constants.ts and backend face_constants.py */
export const FACE_MATCH_THRESHOLD = 0.72;
const DESCRIPTOR_SIZE = 64;
const BLOCK = 8;

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = decodeBase64(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function l2Normalize(vec: number[]): number[] {
  let sumSq = 0;
  for (const v of vec) sumSq += v * v;
  const norm = Math.sqrt(sumSq) || 1;
  return vec.map((v) => v / norm);
}

function extractFromGray(gray: Float32Array, width: number, height: number): number[] {
  const size = DESCRIPTOR_SIZE;
  const resized = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const sx = Math.min(width - 1, Math.floor((x / size) * width));
      const sy = Math.min(height - 1, Math.floor((y / size) * height));
      resized[y * size + x] = gray[sy * width + sx];
    }
  }

  const blockMeans: number[] = [];
  const cell = size / BLOCK;
  for (let by = 0; by < BLOCK; by++) {
    for (let bx = 0; bx < BLOCK; bx++) {
      let sum = 0;
      let count = 0;
      const y0 = Math.floor(by * cell);
      const x0 = Math.floor(bx * cell);
      const y1 = Math.floor((by + 1) * cell);
      const x1 = Math.floor((bx + 1) * cell);
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          sum += resized[y * size + x];
          count++;
        }
      }
      blockMeans.push(count ? sum / count / 255 : 0);
    }
  }

  const hist = new Array(32).fill(0);
  for (let i = 0; i < resized.length; i++) {
    const bin = Math.min(31, Math.floor(resized[i] / 8));
    hist[bin] += 1;
  }
  const histNorm = hist.map((v) => v / resized.length);
  return l2Normalize([...blockMeans, ...histNorm]);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a?.length || !b?.length || a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

export function isFaceMatch(score: number): boolean {
  return score >= FACE_MATCH_THRESHOLD;
}

/** Resize photo and extract the shared face descriptor + JPEG base64 for upload. */
export async function descriptorFromPhotoUri(uri: string): Promise<{
  descriptor: number[];
  imageBase64: string;
}> {
  const manipulated = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: DESCRIPTOR_SIZE, height: DESCRIPTOR_SIZE } }],
    { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG, base64: true }
  );

  if (!manipulated.base64) {
    throw new Error("Failed to read selfie image");
  }

  const binary = base64ToUint8Array(manipulated.base64);
  const decoded = jpeg.decode(binary, { useTArray: true });
  const { data, width, height } = decoded;
  const gray = new Float32Array(width * height);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    gray[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }

  const descriptor = extractFromGray(gray, width, height);
  return {
    descriptor,
    imageBase64: `data:image/jpeg;base64,${manipulated.base64}`,
  };
}
