type ScheduleHealthProps = {
  employees: number;
  schedules: number;
  rules: number;
  pto: number;
};

export default function ScheduleHealth({
  employees,
  schedules,
  rules,
  pto,
}: ScheduleHealthProps) {
  const score =
    employees > 0 &&
    schedules > 0
      ? 100
      : 75;

  return (
    <div className="bg-white rounded-xl shadow p-6">
      <h2 className="text-xl font-bold mb-4">
        Schedule Health
      </h2>

      <div className="mb-6">
        <div className="text-5xl font-bold text-green-600">
          {score}%
        </div>

        <p className="text-gray-500 mt-2">
          Scheduling System Status
        </p>
      </div>

      <div className="space-y-2">
        <div>
          ✅ Employees Loaded: {employees}
        </div>

        <div>
          ✅ Generated Schedules: {schedules}
        </div>

        <div>
          ✅ Active Rules: {rules}
        </div>

        <div>
          ✅ PTO Requests: {pto}
        </div>
      </div>
    </div>
  );
}
``