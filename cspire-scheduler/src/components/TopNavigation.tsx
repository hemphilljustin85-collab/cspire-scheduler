"use client";

export default function TopNavigation() {
  const currentDate = new Date().toLocaleDateString();

  return (
    <div className="bg-white rounded-xl shadow mb-6 px-6 py-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            Workforce Scheduler
          </h1>

          <p className="text-sm text-gray-500">
            Professional Workforce Management Platform
          </p>
        </div>

        <div className="text-right">
          <div className="font-semibold">
            Market Manager
          </div>

          <div className="text-sm text-gray-500">
            {currentDate}
          </div>
        </div>
      </div>
    </div>
  );
}