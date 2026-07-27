export type Employee = {
  id: string;
  employee_name: string;
  position: string;
};

export type PTORecord = {
  employee_id: string;
};

export type AIRule = {
  rule_type: string;
  rule_text: string;
};

export type DaySchedule = {
  Open: string[];
  Mid: string[];
  Close: string[];
};

export type WeeklySchedule = Record<string, DaySchedule>;

function removeEmployeesOnPTO(employees: Employee[], pto: PTORecord[]) {
  const blockedIds = new Set(pto.map((record) => record.employee_id));
  return employees.filter((employee) => !blockedIds.has(employee.id));
}

function buildDay(employees: string[], offset: number): DaySchedule {
  const normalizedOffset = employees.length === 0 ? 0 : offset % employees.length;
  const rotated = [
    ...employees.slice(normalizedOffset),
    ...employees.slice(0, normalizedOffset),
  ];

  while (rotated.length < 6) {
    rotated.push(rotated[rotated.length % employees.length]);
  }

  return {
    Open: rotated.slice(0, 2),
    Mid: rotated.slice(2, 4),
    Close: rotated.slice(4, 6),
  };
}

export function generateSchedule(
  employees: Employee[],
  pto: PTORecord[] = [],
  _rules: AIRule[] = []
): WeeklySchedule {
  const available = removeEmployeesOnPTO(employees, pto);
  const names = available.map((employee) => employee.employee_name);

  if (names.length === 0) {
    throw new Error("No available employees found.");
  }

  return {
    Monday: buildDay(names, 0),
    Tuesday: buildDay(names, 1),
    Wednesday: buildDay(names, 2),
    Thursday: buildDay(names, 3),
    Friday: buildDay(names, 4),
    Saturday: buildDay(names, 5),
  };
}
