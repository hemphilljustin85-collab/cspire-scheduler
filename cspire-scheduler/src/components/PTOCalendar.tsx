type PTOItem = {
  employeeName: string;
  startDate: string;
  endDate: string;
};

type PTOCalendarProps = {
  items: PTOItem[];
};

export default function PTOCalendar({
  items,
}: PTOCalendarProps) {
  return (
    <div className="bg-white rounded-xl shadow p-6">
      <h2 className="text-xl font-bold mb-4">
        PTO Calendar
      </h2>

      <div className="space-y-3">
        {items.map((item, index) => (
          <div
            key={index}
            className="border rounded-lg p-3"
          >
            <div className="font-semibold">
              {item.employeeName}
            </div>

            <div className="text-sm text-gray-500">
              {item.startDate} - {item.endDate}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}