export type EmployeeMetric = {
  employee_name: string;
  monday_closes: number;
  friday_closes: number;
  saturday_closes: number;
  saturdays_off: number;
  total_hours: number;
};

export type Employee = {
  id: string;
  employee_name: string;
  position: string;
};

export function isJustin(
  name: string
) {
  return name === "Justin Hemphill";
}

export function sortBySaturdayCloses(
  employees: EmployeeMetric[]
) {
  return [...employees].sort(
    (a, b) =>
      a.saturday_closes -
      b.saturday_closes
  );
}

export function sortByFridayCloses(
  employees: EmployeeMetric[]
) {
  return [...employees].sort(
    (a, b) =>
      a.friday_closes -
      b.friday_closes
  );
}

export function sortByMondayCloses(
  employees: EmployeeMetric[]
) {
  return [...employees].sort(
    (a, b) =>
      a.monday_closes -
      b.monday_closes
  );
}

export function saturdayOffGoal(
  name: string
) {
  if (isJustin(name)) {
    return 2;
  }

  return 1;
}