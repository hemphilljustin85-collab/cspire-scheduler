export type DaySchedule = {
  Open: string[];
  Mid: string[];
  Close: string[];
};

export type WeekSchedule = {
  Monday: DaySchedule;
  Tuesday: DaySchedule;
  Wednesday: DaySchedule;
  Thursday: DaySchedule;
  Friday: DaySchedule;
  Saturday: DaySchedule;
};