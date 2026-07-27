export type SchedulerSettings = {
  openersPerDay: number;
  closersPerDay: number;
  targetHours: number;
  daysOffPerWeek: number;
  saturdayOffGoal: number;
  managerSaturdayGoal: number;
};

export function getDefaultSettings(): SchedulerSettings {
  return {
    openersPerDay: 2,
    closersPerDay: 2,
    targetHours: 40,
    daysOffPerWeek: 1,
    saturdayOffGoal: 1,
    managerSaturdayGoal: 2,
  };
}