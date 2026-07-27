"use client";

type Props = {
  weekStart: string;
};

export default function ScheduleApprovalCard({
  weekStart,
}: Props) {
  function approveSchedule() {
    alert("Schedule Approved");
  }

  return (
    <div className="bg-white rounded-xl shadow p-6">
      <h2 className="text-xl font-bold mb-4">
        Schedule Approval
      </h2>

      <p className="mb-4">
        Week Starting: {weekStart}
      </p>

      <button
        onClick={approveSchedule}
        className="bg-green-600 text-white px-4 py-2 rounded-lg"
      >
        Approve Schedule
      </button>
    </div>
  );
}