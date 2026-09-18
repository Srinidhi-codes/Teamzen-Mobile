import React, { useRef, useState } from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  useWindowDimensions,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import {
  descriptorFromPhoto,
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
  const { height } = useWindowDimensions();
  // Keep preview on-screen with actions visible (no scroll)
  const cameraHeight = Math.min(Math.round(height * 0.48), 360);

  const capture = async () => {
    if (!cameraRef.current) return;
    setBusy(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        skipProcessing: false,
        base64: true,
      });
      if (!photo?.uri) throw new Error("Capture failed");

      const result = await descriptorFromPhoto(photo.uri, photo.base64, {
        verify: mode === "verify",
        enroll: mode === "enroll",
      });

      const descriptor = result.descriptor;
      const matchScore = result.matchScore ?? 1.0;

      await onSuccess({
        descriptor,
        matchScore,
        verified: result.verified ?? true,
        imageBase64: result.imageBase64,
        photoUri: photo.uri,
      });
    } catch (e: any) {
      Alert.alert(
        "Face Verification",
        e?.message || "Could not detect or verify face. Ensure good lighting and look directly at the camera."
      );
    } finally {
      setBusy(false);
    }
  };

  if (!visible) return null;

  if (!permission?.granted) {
    return (
      <Modal visible transparent animationType="slide" statusBarTranslucent>
        <SafeAreaView style={styles.sheet} edges={["top", "bottom"]}>
          <Text style={styles.title}>Camera permission needed</Text>
          <Text style={styles.hint}>Face attendance requires camera access.</Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={requestPermission}>
            <Text style={styles.primaryText}>Allow camera</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn} onPress={onClose}>
            <Text style={styles.secondaryText}>Cancel</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </Modal>
    );
  }

  return (
    <Modal visible animationType="slide" statusBarTranslucent>
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <Text style={styles.title}>
            {mode === "enroll" ? "Enroll your face" : "Verify face"}
          </Text>
          <Text style={styles.hint}>Center your face, then tap capture</Text>
        </View>

        <View style={[styles.cameraWrap, { height: cameraHeight }]}>
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
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f172a",
    paddingHorizontal: 16,
    justifyContent: "space-between",
  },
  sheet: {
    flex: 1,
    justifyContent: "center",
    backgroundColor: "#0f172a",
    padding: 24,
    gap: 12,
  },
  header: {
    paddingTop: Platform.OS === "android" ? 8 : 0,
    paddingBottom: 8,
  },
  title: { color: "#fff", fontSize: 18, fontWeight: "600", marginBottom: 4 },
  hint: { color: "#94a3b8", fontSize: 13 },
  cameraWrap: {
    width: "100%",
    alignSelf: "center",
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "#38bdf8",
    backgroundColor: "#000",
  },
  camera: { flex: 1 },
  actions: {
    flexDirection: "row",
    gap: 12,
    paddingVertical: 16,
  },
  primaryBtn: {
    flex: 1,
    backgroundColor: "#0284c7",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  primaryText: { color: "#fff", fontWeight: "600" },
  secondaryBtn: {
    flex: 1,
    backgroundColor: "#1e293b",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  secondaryText: { color: "#e2e8f0", fontWeight: "500" },
});
