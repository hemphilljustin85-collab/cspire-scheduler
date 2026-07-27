type EmployeeMetric = {
  employee_name: string;
  monday_closes: number;
  friday_closes: number;
  saturday_closes: number;
};

export function getBestSaturdayCloser(
  metrics: EmployeeMetric[]
) {
  return [...metrics].sort(
    (a, b) =>
      a.saturday_closes -
      b.saturday_closes
  );
}

export function getBestFridayCloser(
  metrics: EmployeeMetric[]
) {
  return [...metrics].sort(
    (a, b) =>
      a.friday_closes -
      b.friday_closes
  );
}

export function getBestMondayCloser(
  metrics: EmployeeMetric[]
) {
  return [...metrics].sort(
    (a, b) =>
      a.monday_closes -
      b.monday_closes
  );
}