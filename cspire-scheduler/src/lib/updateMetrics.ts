import type { WeeklySchedule } from "./scheduler";

type SupabaseClientLike = {
  from: (table: string) => any;
};

type CloseMetric = {
  monday_closes: number;
  friday_closes: number;
  saturday_closes: number;
};

export async function updateMetrics(
  supabase: SupabaseClientLike,
  schedule: WeeklySchedule
) {
  const closeUpdates: Record<string, CloseMetric> = {};

  function addClose(employee: string, field: keyof CloseMetric) {
    closeUpdates[employee] ??= {
      monday_closes: 0,
      friday_closes: 0,
      saturday_closes: 0,
    };
    closeUpdates[employee][field] += 1;
  }

  schedule.Monday?.Close.forEach((employee) => addClose(employee, "monday_closes"));
  schedule.Friday?.Close.forEach((employee) => addClose(employee, "friday_closes"));
  schedule.Saturday?.Close.forEach((employee) => addClose(employee, "saturday_closes"));

  for (const [employeeName, metrics] of Object.entries(closeUpdates)) {
    const { data, error: selectError } = await supabase
      .from("schedule_metrics")
      .select("monday_closes, friday_closes, saturday_closes")
      .eq("employee_name", employeeName)
      .maybeSingle();

    if (selectError) throw selectError;

    const nextValues = {
      employee_name: employeeName,
      monday_closes: (data?.monday_closes ?? 0) + metrics.monday_closes,
      friday_closes: (data?.friday_closes ?? 0) + metrics.friday_closes,
      saturday_closes: (data?.saturday_closes ?? 0) + metrics.saturday_closes,
    };

    const { error: upsertError } = await supabase
      .from("schedule_metrics")
      .upsert(nextValues, { onConflict: "employee_name" });

    if (upsertError) throw upsertError;
  }
}
