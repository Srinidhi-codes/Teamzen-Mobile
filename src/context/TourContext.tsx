import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useRouter } from 'expo-router';
import { OnboardingStorage } from '../utils/onboardingStorage';

export interface TourStep {
  id: string;
  route: string;
  icon: string;
  useImage?: boolean;
  badge: string;
  title: string;
  subtitle: string;
  description: string;
  bullets: string[];
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'dashboard',
    route: '/(tabs)',
    icon: 'home',
    badge: 'Step 1 of 6 • Dashboard',
    title: 'Welcome to Teamzen!',
    subtitle: 'Central Command Center',
    description: 'Your mobile dashboard gives you a real-time overview of your workday at a glance.',
    bullets: [
      'Instant attendance punch status and daily shift timer',
      'Geofenced attendance radar with live office range calculation',
      'Quick shortcuts to requests, recent team updates, and summaries',
    ],
  },
  {
    id: 'attendance',
    route: '/(tabs)/attendance',
    icon: 'time',
    badge: 'Step 2 of 6 • Attendance',
    title: 'Smart Time & Attendance',
    subtitle: 'Face ID & Geofencing Verification',
    description: 'Punch in and out securely with reliable biometric face matching and office GPS boundaries.',
    bullets: [
      'One-tap face recognition attendance matching',
      'Full monthly attendance calendar with color-coded status',
      'Request punch corrections with captured selfie previews',
    ],
  },
  {
    id: 'chat',
    route: '/(tabs)/chat',
    icon: 'sparkles',
    useImage: true,
    badge: 'Step 3 of 6 • AI Assistant',
    title: 'Teamzen AI Workplace Assistant',
    subtitle: 'Intelligent HR Support 24/7',
    description: 'Have questions about leave policies, salary breakdowns, or company rules? Our AI is here to help.',
    bullets: [
      'Ask questions with voice whisper or text input',
      'Instant answers on leave policies, holidays, and payslips',
      'Interactive action cards to apply for leaves right in the chat',
    ],
  },
  {
    id: 'leave',
    route: '/(tabs)/leave',
    icon: 'calendar',
    badge: 'Step 4 of 6 • Leaves',
    title: 'Leave Management',
    subtitle: 'Balances & Fast Approvals',
    description: 'Effortlessly manage your time off, monitor leave balances, and track approvals in real time.',
    bullets: [
      'View available quotas for Casual, Sick, and Earned leaves',
      'Apply with intuitive native calendar date selection',
      'Track pending and approved requests with instant updates',
    ],
  },
  {
    id: 'team',
    route: '/(tabs)/team',
    icon: 'people',
    badge: 'Step 5 of 6 • Org Flow',
    title: 'Team Hierarchy & Peers',
    subtitle: 'Interactive Department Flowchart',
    description: 'Explore your organization reporting structure from leaders to peers in a clear vertical flow.',
    bullets: [
      'Visual hierarchy connecting managers, you, and direct reports',
      'Instant "ON LEAVE" status badges for teammates today',
      'Quick access to team contact information and roles',
    ],
  },
  {
    id: 'vault',
    route: '/(tabs)',
    icon: 'folder-open',
    badge: 'Step 6 of 6 • Vault & More',
    title: 'Documents Vault & Corporate Hub',
    subtitle: 'Sidebar Essentials',
    description: 'Tap the top-left hamburger menu from any screen to access corporate resources anytime.',
    bullets: [
      'Documents Vault to upload and view ID cards and compliance files',
      'Download monthly salary payslips and tax deductions',
      'Company policies handbook, feedback portal, and account profile',
    ],
  },
];

interface TourContextType {
  isTourActive: boolean;
  currentStepIndex: number;
  currentStep: TourStep;
  startTour: () => void;
  closeTour: () => void;
  nextStep: () => void;
  prevStep: () => void;
}

const TourContext = createContext<TourContextType | undefined>(undefined);

export function TourProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [isTourActive, setIsTourActive] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  const startTour = useCallback(() => {
    setCurrentStepIndex(0);
    setIsTourActive(true);
  }, []);

  const closeTour = useCallback(async () => {
    setIsTourActive(false);
    await OnboardingStorage.markInteractiveTourSeen();
  }, []);

  const nextStep = useCallback(() => {
    if (currentStepIndex < TOUR_STEPS.length - 1) {
      const nextIdx = currentStepIndex + 1;
      setCurrentStepIndex(nextIdx);
      const nextTarget = TOUR_STEPS[nextIdx];
      if (nextTarget?.route) {
        try {
          router.navigate(nextTarget.route as any);
        } catch {
          // ignore navigation errors
        }
      }
    } else {
      closeTour();
    }
  }, [currentStepIndex, router, closeTour]);

  const prevStep = useCallback(() => {
    if (currentStepIndex > 0) {
      const prevIdx = currentStepIndex - 1;
      setCurrentStepIndex(prevIdx);
      const prevTarget = TOUR_STEPS[prevIdx];
      if (prevTarget?.route) {
        try {
          router.navigate(prevTarget.route as any);
        } catch {
          // ignore navigation errors
        }
      }
    }
  }, [currentStepIndex, router]);

  const currentStep = TOUR_STEPS[currentStepIndex];

  return (
    <TourContext.Provider
      value={{
        isTourActive,
        currentStepIndex,
        currentStep,
        startTour,
        closeTour,
        nextStep,
        prevStep,
      }}
    >
      {children}
    </TourContext.Provider>
  );
}

export function useTour() {
  const context = useContext(TourContext);
  if (!context) {
    throw new Error('useTour must be used within a TourProvider');
  }
  return context;
}
