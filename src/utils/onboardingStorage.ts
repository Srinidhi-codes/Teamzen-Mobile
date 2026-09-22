import AsyncStorage from "@react-native-async-storage/async-storage";

const ONBOARDING_KEY = "teamzen_onboarding_seen";
const INTERACTIVE_TOUR_KEY = "teamzen_interactive_tour_seen";

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

  async hasSeenInteractiveTour(): Promise<boolean> {
    try {
      const value = await AsyncStorage.getItem(INTERACTIVE_TOUR_KEY);
      return value === "true";
    } catch {
      return false;
    }
  },

  async markInteractiveTourSeen(): Promise<void> {
    try {
      await AsyncStorage.setItem(INTERACTIVE_TOUR_KEY, "true");
    } catch {}
  },
};
