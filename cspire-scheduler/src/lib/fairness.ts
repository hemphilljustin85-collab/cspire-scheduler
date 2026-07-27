export type EmployeeMetric = {
  employeeName: string;

  mondayCloses: number;

  fridayCloses: number;

  saturdayCloses: number;

  saturdaysOff: number;
};

export function sortForSaturdayClose(
  employees: EmployeeMetric[]
) {
  return [...employees].sort(
    (a, b) =>
      a.saturdayCloses -
      b.saturdayCloses
  );
}