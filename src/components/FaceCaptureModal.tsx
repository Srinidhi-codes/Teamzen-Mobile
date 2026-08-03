import React, { useRef, useState } from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import {
  descriptorFromPhotoUri,
  distanceToSimilarity,
  euclideanDistance,
  FACE_DISTANCE_THRESHOLD,
  isFaceMatch,
} from "../services/faceDescriptor";

type Mode = "enroll" | "verify";

interface Props {
  visible: boolean;
  mode: Mode;
  enrolledDescriptor?: number[] | null;
  onClose: () => void;
  onSuccess: (result: {
    descriptor: number[];
    matchScore: number;
    verified: boolean;
    imageBase64: string;
    photoUri: string;
  }) => void | Promise<void>;
}

export default function FaceCaptureModal({
  visible,
  mode,
  enrolledDescriptor,
  onClose,
  onSuccess,
}: Props) {
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);

  const capture = async () => {
    if (!cameraRef.current) return;
    setBusy(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        skipProcessing: false,
      });
      if (!photo?.uri) throw new Error("Capture failed");

      const { descriptor, imageBase64 } = await descriptorFromPhotoUri(photo.uri);

      if (mode === "verify") {
        if (!enrolledDescriptor?.length) {
          Alert.alert("Not enrolled", "Please enroll your face first on the web portal.");
          return;
        }
        const distance = euclideanDistance(descriptor, enrolledDescriptor);
        const matchScore = distanceToSimilarity(distance);
        if (!isFaceMatch(distance)) {
          Alert.alert(
            "Face mismatch",
            `Distance ${distance.toFixed(2)} (need ≤ ${FACE_DISTANCE_THRESHOLD}). Try again.`
          );
          return;
        }
        await onSuccess({ descriptor, matchScore, verified: true, imageBase64, photoUri: photo.uri });
      } else {
        await onSuccess({ descriptor, matchScore: 1, verified: true, imageBase64, photoUri: photo.uri });
      }
    } catch (e: any) {
      Alert.alert(
        "Face capture",
        e?.message || "Could not verify face. Use the web portal for face attendance for now."
      );
    } finally {
      setBusy(false);
    }
  };

  if (!visible) return null;

  if (!permission?.granted) {
    return (
      <Modal visible transparent animationType="slide">
        <View style={styles.sheet}>
          <Text style={styles.title}>Camera permission needed</Text>
          <Text style={styles.hint}>Face attendance requires camera access.</Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={requestPermission}>
            <Text style={styles.primaryText}>Allow camera</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn} onPress={onClose}>
            <Text style={styles.secondaryText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible animationType="slide">
      <View style={styles.container}>
        <Text style={styles.title}>
          {mode === "enroll" ? "Enroll your face" : "Verify face"}
        </Text>
        <Text style={styles.hint}>
          FaceNet models are available on the web portal. Mobile capture will prompt if models are missing.
        </Text>
        <View style={styles.cameraWrap}>
          <CameraView ref={cameraRef} style={styles.camera} facing="front" />
        </View>
        <View style={styles.actions}>
          <TouchableOpacity style={styles.secondaryBtn} onPress={onClose} disabled={busy}>
            <Text style={styles.secondaryText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.primaryBtn} onPress={capture} disabled={busy}>
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryText}>
                {mode === "enroll" ? "Capture & enroll" : "Verify & continue"}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a", padding: 16, paddingTop: 48 },
  sheet: {
    flex: 1,
    justifyContent: "center",
    backgroundColor: "#0f172a",
    padding: 24,
  },
  title: { color: "#fff", fontSize: 18, fontWeight: "600", marginBottom: 8 },
  hint: { color: "#94a3b8", fontSize: 13, marginBottom: 16 },
  cameraWrap: {
    flex: 1,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "#38bdf8",
  },
  camera: { flex: 1 },
  actions: { flexDirection: "row", gap: 12, marginTop: 16 },
  primaryBtn: {
    flex: 1,
    backgroundColor: "#0284c7",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  primaryText: { color: "#fff", fontWeight: "600" },
  secondaryBtn: {
    flex: 1,
    backgroundColor: "#1e293b",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  secondaryText: { color: "#e2e8f0", fontWeight: "500" },
});
