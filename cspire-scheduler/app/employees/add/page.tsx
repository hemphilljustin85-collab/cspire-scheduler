"use client";

import { useState } from "react";
import { supabase } from "../../../src/lib/supabase";

export default function AddEmployeePage() {
  const [name, setName] = useState("");
  const [position, setPosition] = useState("");

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

          <option value="Market Manager">
            Market Manager
          </option>

          <option value="ASR II">
            ASR II
          </option>

          <option value="Team Leader">
            Team Leader
          </option>
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