export const minutesToHours = (minutes: number): { h: number; m: number } => {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return { h: hours, m: remainingMinutes };
};
