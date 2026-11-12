"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../src/lib/supabase";
import { DEFAULT_POSITIONS, loadPositions, type Position } from "../../../src/lib/positions";

export default function AddEmployeePage() {
  const [name, setName] = useState("");
  const [position, setPosition] = useState("");
  const [positions, setPositions] = useState<Position[]>(DEFAULT_POSITIONS);

  useEffect(() => {
    void loadPositions().then((result) => setPositions(result.positions));
  }, []);

  async function saveEmployee() {
    if (!name || !position) {
      alert("Complete all fields");
      return;
    }

    const { error } = await supabase
      .from("employees")
      .insert([
        {
          employee_name: name,
          position,
          status: "Active",
        },
      ]);

    if (error) {
      alert(error.message);
      return;
    }

    alert("Employee Saved");

    setName("");
    setPosition("");
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">
        Add Employee
      </h1>

      <div className="bg-white p-6 rounded shadow max-w-xl">
        <input
          className="border p-2 w-full mb-4"
          placeholder="Employee Name"
          value={name}
          onChange={(e) =>
            setName(e.target.value)
          }
        />

        <select
          className="border p-2 w-full mb-4"
          value={position}
          onChange={(e) =>
            setPosition(e.target.value)
          }
        >
          <option value="">
            Select Position
          </option>

          {positions.map((item) => (
            <option key={item.name} value={item.name}>
              {item.name}
            </option>
          ))}
        </select>

        <button
          onClick={saveEmployee}
          className="bg-green-600 text-white px-4 py-2 rounded"
        >
          Save Employee
        </button>
      </div>
    </div>
  );
}