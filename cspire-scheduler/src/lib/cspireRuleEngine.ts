export type EmployeeMetric = {
  employee_name: string;
  monday_closes: number;
  friday_closes: number;
  saturday_closes: number;
  saturdays_off: number;
  total_hours: number;
};

export function getLowestMondayCloser(
  metrics: EmployeeMetric[]
) {
  return [...metrics].sort(
    (a, b) =>
      a.monday_closes - b.monday_closes
  );
}

export function getLowestFridayCloser(
  metrics: EmployeeMetric[]
) {
  return [...metrics].sort(
    (a, b) =>
      a.friday_closes - b.friday_closes
  );
}

export function getLowestSaturdayCloser(
  metrics: EmployeeMetric[]
) {
  return [...metrics].sort(
    (a, b) =>
      a.saturday_closes -
      b.saturday_closes
  );
}

export function getSaturdayOffTarget(
  employeeName: string
) {
  if (
    employeeName ===
    "Justin Hemphill"
  ) {
    return 2;
  }

  return 1;
}