export default function SavedSchedulesPage() {
  const schedules = [
    {
      week: "July 20, 2026",
      status: "Published",
    },
    {
      week: "July 13, 2026",
      status: "Approved",
    },
    {
      week: "July 6, 2026",
      status: "Archived",
    },
  ];

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-4xl font-bold">
          Saved Schedules
        </h1>

        <button className="bg-blue-600 text-white px-4 py-2 rounded-lg">
          Create New Schedule
        </button>
      </div>

      <div className="space-y-4">
        {schedules.map((schedule) => (
          <div
            key={schedule.week}
            className="bg-white rounded-xl shadow p-6"
          >
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold">
                  Week Starting
                </h2>

                <p className="text-gray-500 mt-1">
                  {schedule.week}
                </p>
              </div>

              <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full">
                {schedule.status}
              </span>
            </div>

            <div className="flex gap-3 mt-4">
              <button className="bg-slate-900 text-white px-3 py-2 rounded">
                View
              </button>

              <button className="bg-green-600 text-white px-3 py-2 rounded">
                Edit
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl shadow p-6 mt-8">
        <h2 className="text-2xl font-bold mb-4">
          Schedule Information
        </h2>

        <ul className="space-y-2">
          <li>• Schedules can be reviewed before publishing</li>
          <li>• Historical schedules are retained</li>
          <li>• Schedules can be regenerated as needed</li>
          <li>• Fairness metrics are tracked over time</li>
        </ul>
      </div>
    </div>
  );
}
``