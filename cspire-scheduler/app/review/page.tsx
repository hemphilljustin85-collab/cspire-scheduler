const schedule = {
  weekOf: "July 20, 2026",
  status: "Pending Approval",
  days: [
    { day: "Monday", open: ["Justin Hemphill", "Shundra Keys"], close: ["Sedrick Sullivan", "Shane Ellis"] },
    { day: "Tuesday", open: ["Tyranee Graves", "Jakayla Stringer"], close: ["Justin Hemphill", "Shundra Keys"] },
    { day: "Wednesday", open: ["Sedrick Sullivan", "Shane Ellis"], close: ["Tyranee Graves", "Jakayla Stringer"] },
    { day: "Thursday", open: ["Justin Hemphill", "Shundra Keys"], close: ["Sedrick Sullivan", "Shane Ellis"] },
    { day: "Friday", open: ["Tyranee Graves", "Jakayla Stringer"], close: ["Justin Hemphill", "Shundra Keys"] },
    { day: "Saturday", open: ["Sedrick Sullivan", "Shane Ellis"], close: ["Tyranee Graves", "Jakayla Stringer"] },
  ],
};

export default function ReviewPage() {
  return (
    <div>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-4xl font-bold">Schedule Review</h1>
          <p className="mt-2 text-slate-600">Week of {schedule.weekOf}</p>
        </div>
        <span className="w-fit rounded-full bg-amber-100 px-4 py-2 text-sm font-semibold text-amber-800">
          {schedule.status}
        </span>
      </div>

      <div className="space-y-4">
        {schedule.days.map((item) => (
          <section key={item.day} className="rounded-xl bg-white p-6 shadow">
            <h2 className="mb-4 text-2xl font-bold">{item.day}</h2>
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <h3 className="mb-2 font-bold text-green-700">Open</h3>
                {item.open.map((employee) => <div key={employee}>{employee}</div>)}
              </div>
              <div>
                <h3 className="mb-2 font-bold text-red-700">Close</h3>
                {item.close.map((employee) => <div key={employee}>{employee}</div>)}
              </div>
            </div>
          </section>
        ))}
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        <button className="rounded-lg bg-green-600 px-5 py-3 font-semibold text-white">Approve Schedule</button>
        <button className="rounded-lg bg-slate-200 px-5 py-3 font-semibold text-slate-800">Return for Changes</button>
      </div>
    </div>
  );
}
