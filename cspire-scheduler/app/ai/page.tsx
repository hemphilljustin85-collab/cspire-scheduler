export default function AIPage() {
  const commands = [
    "Generate next week's schedule",
    "Give Justin Saturday off",
    "Shundra no close Friday",
    "Sedrick PTO August 10-12",
    "Balance everyone around 40 hours",
  ];

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-4xl font-bold">
          AI Assistant
        </h1>

        <button className="bg-blue-600 text-white px-4 py-2 rounded-lg">
          Run Command
        </button>
      </div>

      <div className="bg-white rounded-xl shadow p-6 mb-8">
        <label className="block font-semibold mb-3">
          Enter Scheduling Command
        </label>

        <textarea
          className="w-full border rounded-lg p-4 h-32"
          placeholder="Generate next week's schedule"
        />

        <button className="mt-4 bg-green-600 text-white px-4 py-2 rounded-lg">
          Submit
        </button>
      </div>

      <div className="bg-white rounded-xl shadow p-6">
        <h2 className="text-2xl font-bold mb-4">
          Example Commands
        </h2>

        <div className="space-y-3">
          {commands.map((command) => (
            <div
              key={command}
              className="border rounded-lg p-3"
            >
              {command}
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow p-6 mt-8">
        <h2 className="text-2xl font-bold mb-4">
          Supported Actions
        </h2>

        <ul className="space-y-2">
          <li>✅ Generate Schedule</li>
          <li>✅ PTO Requests</li>
          <li>✅ No Open Rules</li>
          <li>✅ No Close Rules</li>
          <li>✅ Saturday Off Requests</li>
          <li>✅ Fairness Balancing</li>
          <li>✅ Hours Balancing</li>
        </ul>
      </div>
    </div>
  );
}