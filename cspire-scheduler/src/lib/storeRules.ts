export type StoreRules = {
  openersPerDay: number;
  closersPerDay: number;
  targetHours: number;
  daysOffPerWeek: number;
  saturdayOffGoal: number;
  managerSaturdayGoal: number;
};

export const defaultStoreRules: StoreRules =
  {
    openersPerDay: 2,
    closersPerDay: 2,
    targetHours: 40,
    daysOffPerWeek: 1,
    saturdayOffGoal: 1,
    managerSaturdayGoal: 2,
  };