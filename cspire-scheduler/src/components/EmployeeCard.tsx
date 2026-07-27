type EmployeeCardProps = {
  employeeName: string;
  position: string;
  status?: string;
};

export default function EmployeeCard({
  employeeName,
  position,
  status = "Active",
}: EmployeeCardProps) {
  return (
    <div className="bg-white rounded-xl shadow p-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="font-bold text-lg">
            {employeeName}
          </h2>

          <p className="text-gray-500">
            {position}
          </p>
        </div>

        <span
          className={`px-3 py-1 rounded-full text-sm ${
            status === "Active"
              ? "bg-green-100 text-green-700"
              : "bg-red-100 text-red-700"
          }`}
        >
          {status}
        </span>
      </div>
    </div>
  );
}