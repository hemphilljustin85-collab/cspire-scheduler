type DaySchedule = {
  Open: string[];
  Mid: string[];
  Close: string[];
};

type WeeklyScheduleBoardProps = {
  schedule: Record<string, DaySchedule>;
};

export default function WeeklyScheduleBoard({
  schedule,
}: WeeklyScheduleBoardProps) {
  return (
    <div className="bg-white rounded-xl shadow overflow-hidden">
      <div className="grid grid-cols-4 bg-slate-900 text-white">
        <div className="p-4 font-bold">
          Day
        </div>

        <div className="p-4 font-bold">
          Open
        </div>

        <div className="p-4 font-bold">
          Mid
        </div>

        <div className="p-4 font-bold">
          Close
        </div>
      </div>

      {Object.entries(schedule).map(
        ([day, shifts]) => (
          <div
            key={day}
            className="grid grid-cols-4 border-b"
          >
            <div className="p-4 font-bold bg-slate-50">
              {day}
            </div>

            <div className="p-4">
              {(shifts.Open || []).map(
                (employee) => (
                  <div key={employee}>
                    {employee}
                  </div>
                )
              )}
            </div>

            <div className="p-4">
              {(shifts.Mid || []).map(
                (employee) => (
                  <div key={employee}>
                    {employee}
                  </div>
                )
              )}
            </div>

            <div className="p-4">
              {(shifts.Close || []).map(
                (employee) => (
                  <div key={employee}>
                    {employee}
                  </div>
                )
              )}
            </div>
          </div>
        )
      )}
    </div>
  );
}