export type ShiftType =
  | "MONDAY_OPEN"
  | "OPEN"
  | "MID"
  | "CLOSE";

export const ShiftTimes = {
  MONDAY_OPEN: {
    start: "8:15 AM",
    end: "5:30 PM",
  },

  OPEN: {
    start: "8:30 AM",
    end: "5:30 PM",
  },

  MID: {
    start: "9:00 AM",
    end: "6:00 PM",
  },

  CLOSE: {
    start: "10:30 AM",
    end: "7:15 PM",
  },
};