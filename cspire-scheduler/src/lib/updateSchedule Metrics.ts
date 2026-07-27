type MetricRecord = {
  id: string;
  employee_id: string;
  monday_closes: number;
  friday_closes: number;
  saturday_closes: number;
};

type Employee = {
  id: string;
  employee_name: string;
};

export async function updateScheduleMetrics(
  supabase: any,
  schedule: any,
  metrics: MetricRecord[],
  employees: Employee[]
) {
  const employeeMap = new Map(
    employees.map((employee) => [
      employee.employee_name,
      employee.id,
    ])
  );

  const updates: Record<
    string,
    {
      monday_closes: number;
      friday_closes: number;
      saturday_closes: number;
    }
  > = {};

  function addClose(
    employeeName: string,
    field: "monday_closes" | "friday_closes" | "saturday_closes"
  ) {
    if (!updates[employeeName]) {
      updates[employeeName] = {
        monday_closes: 0,
        friday_closes: 0,
        saturday_closes: 0,
      };
    }

    updates[employeeName][field]++;
  }

  schedule.Monday.Close.forEach(
    (name: string) =>
      addClose(name, "monday_closes")
  );

  schedule.Friday.Close.forEach(
    (name: string) =>
      addClose(name, "friday_closes")
  );

  schedule.Saturday.Close.forEach(
    (name: string) =>
      addClose(name, "saturday_closes")
  );

  for (const employeeName of Object.keys(
    updates
  )) {
    const employeeId =
      employeeMap.get(employeeName);

    if (!employeeId) continue;

    const metric = metrics.find(
      (m) => m.employee_id === employeeId
    );

    if (!metric) continue;

    await supabase
      .from("schedule_metrics")
      .update({
        monday_closes:
          metric.monday_closes +
          updates[employeeName]
            .monday_closes,

        friday_closes:
          metric.friday_closes +
          updates[employeeName]
            .friday_closes,

        saturday_closes:
          metric.saturday_closes +
          updates[employeeName]
            .saturday_closes,
      })
      .eq("id", metric.id);
  }
}