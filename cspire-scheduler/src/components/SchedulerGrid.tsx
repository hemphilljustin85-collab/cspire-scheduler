type DaySchedule = {
  Open: string[];
  Mid: string[];
  Close: string[];
};

type ScheduleGridProps = {
  schedule: Record<string, DaySchedule>;
};

export default function ScheduleGrid({
  schedule,
}: ScheduleGridProps) {
  return (
    <div className="space-y-4">
      {Object.entries(schedule).map(
        ([day, shifts]) => (
          <div
            key={day}
            className="bg-white rounded-xl shadow p-4"
          >
            <h2 className="text-xl font-bold mb-4">
              {day}
            </h2>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <h3 className="font-semibold text-green-700 mb-2">
                  Open
                </h3>

                {shifts.Open.map(
                  (employee) => (
                    <div
                      key={employee}
                      className="mb-1"
                    >
                      {employee}
                    </div>
                  )
                )}
              </div>

              <div>
                <h3 className="font-semibold text-blue-700 mb-2">
                  Mid
                </h3>

                {shifts.Mid.map(
                  (employee) => (
                    <div
                      key={employee}
                      className="mb-1"
                    >
                      {employee}
                    </div>
                  )
                )}
              </div>

              <div>
                <h3 className="font-semibold text-red-700 mb-2">
                  Close
                </h3>

                {shifts.Close.map(
                  (employee) => (
                    <div
                      key={employee}
                      className="mb-1"
                    >
                      {employee}
                    </div>
                  )
                )}
              </div>
            </div>
          </div>
        )
      )}
    </div>
  );
}