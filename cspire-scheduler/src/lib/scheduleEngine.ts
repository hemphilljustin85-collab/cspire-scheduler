export type SchedulerEmployee = {
  id: string;
  employee_name: string;
  position: string;
};

export type SchedulerMetrics = {
  employee_name: string;
  monday_closes: number;
  friday_closes: number;
  saturday_closes: number;
  saturdays_off: number;
};

export function buildCSpireSchedule(
  employees: SchedulerEmployee[],
  metrics: SchedulerMetrics[]
) {
  const sortedEmployees = [...employees];

  const saturdayRotation = [...metrics].sort(
    (a, b) =>
      a.saturday_closes - b.saturday_closes
  );

  return {
    rulesUsed: {
      openers: 2,
      closers: 2,
      targetHours: 40,
    },

    Monday: {
      Open: [
        sortedEmployees[0]?.employee_name,
        sortedEmployees[1]?.employee_name,
      ],

      Mid: [
        sortedEmployees[2]?.employee_name,
        sortedEmployees[3]?.employee_name,
      ],

      Close: [
        sortedEmployees[4]?.employee_name,
        sortedEmployees[5]?.employee_name,
      ],
    },

    Saturday: {
      PriorityCloser:
        saturdayRotation[0]?.employee_name,
    },
  };
}