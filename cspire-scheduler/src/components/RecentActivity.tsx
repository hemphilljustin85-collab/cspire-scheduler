type ActivityItem = {
  title: string;
  description: string;
  date: string;
};

type RecentActivityProps = {
  activities: ActivityItem[];
};

export default function RecentActivity({
  activities,
}: RecentActivityProps) {
  return (
    <div className="bg-white rounded-xl shadow p-6">
      <h2 className="text-xl font-bold mb-4">
        Recent Activity
      </h2>

      <div className="space-y-4">
        {activities.map((activity, index) => (
          <div
            key={index}
            className="border-b pb-3"
          >
            <div className="font-semibold">
              {activity.title}
            </div>

            <div className="text-sm text-gray-500">
              {activity.description}
            </div>

            <div className="text-xs text-gray-400 mt-1">
              {activity.date}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}