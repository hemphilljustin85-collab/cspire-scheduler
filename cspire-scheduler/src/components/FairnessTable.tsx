type Metric = {
  employee_name: string;
  monday_closes: number;
  friday_closes: number;
  saturday_closes: number;
  total_hours: number;
};

type Props = {
  metrics: Metric[];
};

export default function FairnessTable({
  metrics,
}: Props) {
  return (
    <div className="bg-white rounded-xl shadow p-6">
      <h2 className="text-xl font-bold mb-4">
        Fairness Metrics
      </h2>

      <table className="w-full">
        <thead>
          <tr className="border-b">
            <th className="text-left p-2">
              Employee
            </th>

            <th className="text-left p-2">
              Monday
            </th>

            <th className="text-left p-2">
              Friday
            </th>

            <th className="text-left p-2">
              Saturday
            </th>

            <th className="text-left p-2">
              Hours
            </th>
          </tr>
        </thead>

        <tbody>
          {metrics.map((metric) => (
            <tr
              key={metric.employee_name}
              className="border-b"
            >
              <td className="p-2">
                {metric.employee_name}
              </td>

              <td className="p-2">
                {metric.monday_closes}
              </td>

              <td className="p-2">
                {metric.friday_closes}
              </td>

              <td className="p-2">
                {metric.saturday_closes}
              </td>

              <td className="p-2">
                {metric.total_hours}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}