type ScheduleSummaryProps = {
  totalEmployees: number;
  totalRules: number;
  totalPTO: number;
  totalSchedules: number;
};

export default function ScheduleSummary({
  totalEmployees,
  totalRules,
  totalPTO,
  totalSchedules,
}: ScheduleSummaryProps) {
  return (
    <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-6">
      <div className="bg-white rounded-xl shadow p-6">
        <div className="text-gray-500 text-sm">
          Employees
        </div>

        <div className="text-3xl font-bold mt-2">
          {totalEmployees}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow p-6">
        <div className="text-gray-500 text-sm">
          Active Rules
        </div>

        <div className="text-3xl font-bold mt-2">
          {totalRules}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow p-6">
        <div className="text-gray-500 text-sm">
          PTO Requests
        </div>

        <div className="text-3xl font-bold mt-2">
          {totalPTO}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow p-6">
        <div className="text-gray-500 text-sm">
          Schedules Generated
        </div>

        <div className="text-3xl font-bold mt-2">
          {totalSchedules}
        </div>
      </div>
    </div>
  );
}