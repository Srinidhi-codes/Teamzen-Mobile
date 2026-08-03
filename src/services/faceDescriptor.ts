/** Must stay in sync with backend/attendance/face_constants.py */
export const FACE_DESCRIPTOR_DIM = 128;
export const FACE_DISTANCE_THRESHOLD = 0.5;
export const FACE_MATCH_THRESHOLD = 0.5;

/**
 * Mobile FaceNet extraction is not wired in this build (requires TF.js models).
 * Use the employee web portal to enroll and punch with face verification.
 * This module keeps distance helpers for when native models are added.
 */
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

export async function descriptorFromPhotoUri(_uri: string): Promise<{
  descriptor: number[];
  imageBase64: string;
}> {
  throw new Error(
    "Face matching on mobile requires the FaceNet model pack. Please enroll and punch from the web portal for now."
  );
}
