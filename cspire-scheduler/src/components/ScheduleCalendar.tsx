type ScheduleCalendarProps = {
  schedule: any;
};

export default function ScheduleCalendar({
  schedule,
}: ScheduleCalendarProps) {
  if (!schedule) {
    return null;
  }

  return (
    <div className="overflow-auto">
      <table className="w-full bg-white rounded-xl shadow">
        <thead>
          <tr className="border-b">
            <th className="p-4 text-left">
              Day
            </th>

            <th className="p-4 text-left">
              Open
            </th>

            <th className="p-4 text-left">
              Mid
            </th>

            <th className="p-4 text-left">
              Close
            </th>
          </tr>
        </thead>

        <tbody>
          {Object.entries(schedule).map(
            ([day, shifts]: any) => (
              <tr
                key={day}
                className="border-b"
              >
                <td className="p-4 font-bold">
                  {day}
                </td>

                <td className="p-4">
                  {shifts.Open.join(", ")}
                </td>

                <td className="p-4">
                  {shifts.Mid.join(", ")}
                </td>

                <td className="p-4">
                  {shifts.Close.join(", ")}
                </td>
              </tr>
            )
          )}
        </tbody>
      </table>
    </div>
  );
}