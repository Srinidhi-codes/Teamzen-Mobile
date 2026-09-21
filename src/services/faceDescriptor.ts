import * as FileSystem from 'expo-file-system';
import { API_URL } from './api';
import { AuthService } from './auth';

/** Must stay in sync with backend/attendance/face_constants.py */
export const FACE_DESCRIPTOR_DIM = 128;
export const FACE_DISTANCE_THRESHOLD = 0.6;
export const FACE_MATCH_THRESHOLD = 0.4;

export function euclideanDistance(a: number[], b: number[]): number {
  if (!a?.length || !b?.length || a.length !== b.length) return Number.POSITIVE_INFINITY;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

export function distanceToSimilarity(distance: number): number {
  return Math.max(0, 1 - distance);
}

export function isFaceMatch(distance: number): boolean {
  return distance <= FACE_DISTANCE_THRESHOLD;
}

export interface FaceExtractionResult {
  descriptor: number[];
  detectionConfidence: number;
  verified?: boolean;
  distance?: number;
  matchScore?: number;
  imageBase64: string;
}

/**
 * Upload captured photo to backend AI engine for 128-d face detection & feature extraction.
 * Uses JSON Base64 to guarantee 100% native stability across React Native platforms.
 */
export async function descriptorFromPhoto(
  uri: string,
  base64Data?: string | null,
  options: { verify?: boolean; enroll?: boolean } = {}
): Promise<FaceExtractionResult> {
  let photoBase64 = base64Data;
  if (!photoBase64) {
    photoBase64 = await FileSystem.readAsStringAsync(uri, {
      encoding: 'base64',
    });
  }

  const token = await AuthService.getAccessToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}/api/attendance/face/extract/`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      photo_base64: photoBase64,
      verify: !!options.verify,
      enroll: !!options.enroll,
    }),
  });

  const rawText = await response.text();
  let data: any;
  try {
    data = JSON.parse(rawText);
  } catch (e) {
    console.error(`Face extraction endpoint non-JSON response (${response.status}):`, rawText.slice(0, 300));
    throw new Error(`Server error (${response.status}). Please try again.`);
  }

  if (!response.ok || data.error) {
    throw new Error(data.error || 'Face detection failed. Ensure good lighting and face the camera.');
  }

  return {
    descriptor: data.descriptor,
    detectionConfidence: data.detection_confidence || 1.0,
    verified: data.verified,
    distance: data.distance,
    matchScore: data.match_score,
    imageBase64: photoBase64,
  };
}

export const descriptorFromPhotoUri = (
  uri: string,
  options: { verify?: boolean; enroll?: boolean } = {}
) => descriptorFromPhoto(uri, null, options);
