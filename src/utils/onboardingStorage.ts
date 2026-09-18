import AsyncStorage from "@react-native-async-storage/async-storage";

const ONBOARDING_KEY = "teamzen_onboarding_seen";

export const OnboardingStorage = {
  async hasSeenOnboarding(): Promise<boolean> {
    try {
      const value = await AsyncStorage.getItem(ONBOARDING_KEY);
      return value === "true";
    } catch {
      return false;
    }
  },

  async markOnboardingSeen(): Promise<void> {
    try {
      await AsyncStorage.setItem(ONBOARDING_KEY, "true");
    } catch {
      // Fail silently
    }
  },

  async resetOnboarding(): Promise<void> {
    try {
      await AsyncStorage.removeItem(ONBOARDING_KEY);
    } catch {}
  },
};
