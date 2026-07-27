export type SchedulerEmployee = {
  id: string;
  employee_name: string;
};

export type SchedulerMetric = {
  employee_id: string;
  monday_closes: number;
  friday_closes: number;
  saturday_closes: number;
  saturdays_off: number;
  total_hours: number;
};

export type SchedulerRule = {
  rule_type: string;
  rule_text: string;
};

export type PTORecord = {
  employee_id: string;
};

export function buildSchedulerV2(
  employees: SchedulerEmployee[],
  pto: PTORecord[],
  metrics: SchedulerMetric[],
  rules: SchedulerRule[]
) {
  const blockedIds = new Set(
    pto.map((p) => p.employee_id)
  );

  const availableEmployees =
    employees.filter(
      (employee) =>
        !blockedIds.has(employee.id)
    );

  const names =
    availableEmployees.map(
      (employee) =>
        employee.employee_name
    );

  while (names.length < 6) {
    names.push(names[0]);
  }

  return {
    Monday: {
      Open: [names[0], names[1]],
      Mid: [names[2], names[3]],
      Close: [names[4], names[5]],
    },

    Tuesday: {
      Open: [names[1], names[2]],
      Mid: [names[3], names[4]],
      Close: [names[5], names[0]],
    },

    Wednesday: {
      Open: [names[2], names[3]],
      Mid: [names[4], names[5]],
      Close: [names[0], names[1]],
    },

    Thursday: {
      Open: [names[3], names[4]],
      Mid: [names[5], names[0]],
      Close: [names[1], names[2]],
    },

    Friday: {
      Open: [names[4], names[5]],
      Mid: [names[0], names[1]],
      Close: [names[2], names[3]],
    },

    Saturday: {
      Open: [names[5], names[0]],
      Mid: [names[1], names[2]],
      Close: [names[3], names[4]],
    },
  };
}