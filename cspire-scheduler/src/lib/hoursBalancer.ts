export type EmployeeHours = {
  employee_name: string;
  total_hours: number;
};

export function sortByLowestHours(
  employees: EmployeeHours[]
) {
  return [...employees].sort(
    (a, b) =>
      a.total_hours - b.total_hours
  );
}

export function needsMoreHours(
  employee: EmployeeHours
) {
  return employee.total_hours < 40;
}