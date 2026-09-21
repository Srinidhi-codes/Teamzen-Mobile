import { API_URL, getValidAccessToken } from './api';
import * as FileSystem from 'expo-file-system/legacy';
import { FileSystemUploadType } from 'expo-file-system/legacy';

export class VoiceWhisperService {
  private recorder: any = null;
  private isRecordingActive = false;

  private async getAudioModule() {
    try {
      const expoAudio = await import('expo-audio');
      return expoAudio;
    } catch (e) {
      console.warn('expo-audio is not available:', e);
      return null;
    }
  }

  async isSupported(): Promise<boolean> {
    const audio = await this.getAudioModule();
    return !!audio;
  }

  async requestPermission(): Promise<boolean> {
    try {
      const audio = await this.getAudioModule();
      if (!audio || !audio.requestRecordingPermissionsAsync) {
        return false;
      }
      const res = await audio.requestRecordingPermissionsAsync();
      return res.status === 'granted';
    } catch (err) {
      console.error('Mic permission request error:', err);
      return false;
    }
  }

  async startRecording(onAutoStop?: () => void): Promise<boolean> {
    try {
      const audio = await this.getAudioModule();
      if (!audio) {
        throw new Error('Audio recording module is not available in this environment.');
      }

      const hasPermission = await this.requestPermission();
      if (!hasPermission) {
        throw new Error('Microphone permission not granted.');
      }

      if (audio.setAudioModeAsync) {
        await audio.setAudioModeAsync({
          allowsRecording: true,
          playsInSilentMode: true,
        });
      }

      if (this.recorder) {
        try {
          if (typeof this.recorder.stopAsync === 'function') {
            await this.recorder.stopAsync();
          } else if (typeof this.recorder.stop === 'function') {
            this.recorder.stop();
          }
        } catch {
          // ignore cleanup error
        }
        this.recorder = null;
      }

      const presets = audio.RecordingPresets?.HIGH_QUALITY || {};
      
      // Attempt instantiation via AudioModule or fallback
      let recorderInstance: any = null;
      try {
        const AudioModule = (await import('expo-audio/build/AudioModule')).default;
        if (AudioModule && AudioModule.AudioRecorder) {
          recorderInstance = new AudioModule.AudioRecorder(presets);
        }
      } catch {
        // fallback
      }

      if (!recorderInstance && (audio as any).AudioRecorder) {
        recorderInstance = new (audio as any).AudioRecorder(presets);
      }

      if (!recorderInstance) {
        throw new Error('Unable to initialize audio recorder.');
      }

      if (typeof recorderInstance.prepareToRecordAsync === 'function') {
        const prepareOptions = { ...presets, isMeteringEnabled: true };
        await recorderInstance.prepareToRecordAsync(prepareOptions);
      }

      if (typeof recorderInstance.setOnRecordingStatusUpdate === 'function') {
        let silentCounter = 0;
        if (typeof recorderInstance.setProgressUpdateIntervalAsync === 'function') {
          await recorderInstance.setProgressUpdateIntervalAsync(200);
        }
        recorderInstance.setOnRecordingStatusUpdate((status: any) => {
          if (status.isRecording && status.metering !== undefined) {
            // -45 dB is fairly quiet; adjust threshold if needed
            if (status.metering < -45) {
              silentCounter++;
              if (silentCounter > 12) { // 12 * 200ms = 2.4 seconds of silence
                if (onAutoStop && this.isRecordingActive) {
                  onAutoStop();
                }
              }
            } else {
              silentCounter = 0;
            }
          }
        });
      }

      if (typeof recorderInstance.recordAsync === 'function') {
        await recorderInstance.recordAsync();
      } else if (typeof recorderInstance.record === 'function') {
        recorderInstance.record();
      }

      this.recorder = recorderInstance;
      this.isRecordingActive = true;
      return true;
    } catch (err) {
      console.error('Failed to start recording:', err);
      this.isRecordingActive = false;
      this.recorder = null;
      throw err;
    }
  }

  async stopAndTranscribe(): Promise<string> {
    if (!this.recorder) {
      throw new Error('No active recording found');
    }

    try {
      this.isRecordingActive = false;
      const rec = this.recorder;
      this.recorder = null;

      if (typeof rec.stopAsync === 'function') {
        await rec.stopAsync();
      } else if (typeof rec.stop === 'function') {
        rec.stop();
      }

      const uri = rec.uri;

      const audio = await this.getAudioModule();
      if (audio && audio.setAudioModeAsync) {
        await audio.setAudioModeAsync({
          allowsRecording: false,
        }).catch(() => {});
      }

      if (!uri) {
        throw new Error('No audio recording generated');
      }

      const token = await getValidAccessToken();
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await FileSystem.uploadAsync(`${API_URL}/api/ai/transcribe/`, uri, {
        fieldName: 'file',
        httpMethod: 'POST',
        uploadType: FileSystemUploadType.MULTIPART,
        headers,
      });

      if (response.status !== 200) {
        let errorData: any = {};
        try {
          errorData = JSON.parse(response.body);
        } catch(e) {}
        throw new Error(errorData.error || 'Speech transcription failed');
      }

      const data = JSON.parse(response.body);
      return (data.text || '').trim();
    } catch (err) {
      console.error('Error during voice transcription:', err);
      throw err;
    }
  }

  async cancelRecording(): Promise<void> {
    try {
      this.isRecordingActive = false;
      if (this.recorder) {
        const rec = this.recorder;
        this.recorder = null;
        if (typeof rec.stopAsync === 'function') {
          await rec.stopAsync();
        } else if (typeof rec.stop === 'function') {
          rec.stop();
        }
      }
      const audio = await this.getAudioModule();
      if (audio && audio.setAudioModeAsync) {
        await audio.setAudioModeAsync({
          allowsRecording: false,
        }).catch(() => {});
      }
    } catch (err) {
      console.warn('Error cancelling voice recording:', err);
    }
  }

  get isRecording(): boolean {
    return this.isRecordingActive;
  }
}

export const voiceWhisper = new VoiceWhisperService();
