type DashboardCardsProps = {
  employees: number;
  schedules: number;
  rules: number;
  pto: number;
};

export default function DashboardCards({
  employees,
  schedules,
  rules,
  pto,
}: DashboardCardsProps) {
  const cards = [
    {
      title: "Employees",
      value: employees,
    },
    {
      title: "Schedules",
      value: schedules,
    },
    {
      title: "Rules",
      value: rules,
    },
    {
      title: "PTO Requests",
      value: pto,
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
      {cards.map((card) => (
        <div
          key={card.title}
          className="bg-white rounded-xl shadow p-6"
        >
          <div className="text-gray-500 text-sm">
            {card.title}
          </div>

          <div className="text-4xl font-bold mt-3">
            {card.value}
          </div>
        </div>
      ))}
    </div>
  );
}