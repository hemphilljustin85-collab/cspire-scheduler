export type Employee = {
  id: string;
  name: string;
};

export type Rule = {
  type: string;
  value: string;
};

export type DaySchedule = {
  open: string[];
  close: string[];
};

export type WeeklySchedule = {
  Monday: DaySchedule;
  Tuesday: DaySchedule;
  Wednesday: DaySchedule;
  Thursday: DaySchedule;
  Friday: DaySchedule;
  Saturday: DaySchedule;
};

export function generateSchedule(
  employees: Employee[],
  rules: Rule[] = []
): WeeklySchedule {
  const names = employees.map(
    (employee) => employee.name
  );

  const rotate = (index: number) => {
    const list = [
      ...names.slice(index),
      ...names.slice(0, index),
    ];

    return {
      open: list.slice(0, 2),
      close: list.slice(2, 4),
    };
  };

  return {
    Monday: rotate(0),
    Tuesday: rotate(1),
    Wednesday: rotate(2),
    Thursday: rotate(3),
    Friday: rotate(4),
    Saturday: rotate(5),
  };
}