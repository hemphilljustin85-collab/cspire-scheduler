export function employeeOnPTO(
  employeeId: string,
  ptoRecords: any[],
  date: string
) {
  return ptoRecords.some((pto) => {
    return (
      pto.employee_id === employeeId &&
      date >= pto.start_date &&
      date <= pto.end_date
    );
  });
}