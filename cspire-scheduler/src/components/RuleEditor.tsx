"use client";

import { useState } from "react";

export default function RuleEditor() {
  const [rule, setRule] = useState("");

  function saveRule() {
    alert(`Rule Saved:\n${rule}`);
    setRule("");
  }

  return (
    <div className="bg-white rounded-xl shadow p-6">
      <h2 className="text-xl font-bold mb-4">
        Scheduler Rules
      </h2>

      <textarea
        value={rule}
        onChange={(e) => setRule(e.target.value)}
        className="w-full border rounded-lg p-4 h-40"
        placeholder="Shundra Keys No Close"
      />

      <button
        onClick={saveRule}
        className="bg-blue-600 text-white px-4 py-2 rounded-lg mt-4"
      >
        Save Rule
      </button>
    </div>
  );
}