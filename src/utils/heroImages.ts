export type DayPeriod = 'morning' | 'noon' | 'evening' | 'night';

export function greetingForHour(hour: number): string {
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  if (hour >= 17 && hour < 21) return 'Good evening';
  return 'Good night';
}

export function periodForHour(hour: number): DayPeriod {
  if (hour >= 5 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 17) return 'noon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

export const HERO_ASSETS = {
  morning: {
    day1: require('../../assets/images/hero/morning.webp'),
    day2: require('../../assets/images/hero/morning-2.webp'),
    dark: false,
  },
  noon: {
    day1: require('../../assets/images/hero/noon.webp'),
    day2: require('../../assets/images/hero/noon-2.webp'),
    dark: false,
  },
  evening: {
    day1: require('../../assets/images/hero/evening.webp'),
    day2: require('../../assets/images/hero/evening-2.webp'),
    dark: false,
  },
  night: {
    day1: require('../../assets/images/hero/night.webp'),
    day2: require('../../assets/images/hero/night-2.webp'),
    dark: true,
  },
};

export function getHeroBannerConfig(date: Date = new Date()) {
  const hour = date.getHours();
  const dayOfMonth = date.getDate();
  const period = periodForHour(hour);
  const heroMeta = HERO_ASSETS[period];
  const imageSource = dayOfMonth % 2 === 1 ? heroMeta.day1 : heroMeta.day2;
  const greeting = greetingForHour(hour);

  return {
    period,
    greeting,
    imageSource,
    dark: heroMeta.dark,
  };
}
