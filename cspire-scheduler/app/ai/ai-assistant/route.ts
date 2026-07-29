import { NextRequest, NextResponse } from "next/server";

type AssistantAction = {
  type: string;
  description: string;
  payload: Record<string, unknown>;
};

type Employee = {
  id: string;
  employee_name: string;
  employee_id: string | null;
  position: string | null;
  status: string | null;
};

const SHIFT_CODES = [
  "OFF",
  "PTO",
  "HOLIDAY",
  "815-530",
  "830-530",
  "900-600",
  "1030-715",
] as const;

function environment(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing server environment variable: ${name}`);
  return value;
}

function cleanJson(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return fenced ? fenced[1].trim() : trimmed;
}

async function verifyUser(request: NextRequest) {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  const supabaseUrl = environment("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = environment("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: anonKey,
      Authorization: authorization,
    },
    cache: "no-store",
  });

  if (!response.ok) return null;

  return {
    authorization,
    user: await response.json(),
  };
}

async function supabaseRequest<T>(
  authorization: string,
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const supabaseUrl = environment("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = environment("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: anonKey,
      Authorization: authorization,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(options.headers || {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `Database request failed (${response.status}): ${await response.text()}`,
    );
  }

  const text = await response.text();
  return (text ? JSON.parse(text) : null) as T;
}

function mondayFor(dateValue: string) {
  const date = new Date(`${dateValue}T12:00:00`);
  const day = date.getDay();
  const difference = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + difference);
  return date.toISOString().slice(0, 10);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeName(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

async function findEmployee(
  authorization: string,
  nameOrId: unknown,
): Promise<Employee> {
  const employees = await supabaseRequest<Employee[]>(
    authorization,
    "employees?select=id,employee_name,employee_id,position,status&order=employee_name.asc",
  );

  const target = normalizeName(nameOrId);

  const exact = employees.find(
    (employee) =>
      normalizeName(employee.employee_name) === target ||
      normalizeName(employee.employee_id) === target,
  );

  const partial =
    exact ||
    employees.find((employee) =>
      normalizeName(employee.employee_name).includes(target),
    );

  if (!partial) {
    throw new Error(`I could not find an employee matching "${nameOrId}".`);
  }

  return partial;
}

async function loadSnapshot(authorization: string) {
  const start = today();
  const scheduleStart = mondayFor(start);

  const [employees, pto, rules, schedules] = await Promise.all([
    supabaseRequest<unknown[]>(
      authorization,
      "employees?select=id,employee_name,employee_id,position,status,hire_date&order=employee_name.asc",
    ),
    supabaseRequest<unknown[]>(
      authorization,
      `employee_time_off?select=id,employee_id,start_date,end_date,reason,status&end_date=gte.${start}&order=start_date.asc&limit=100`,
    ),
    supabaseRequest<unknown[]>(
      authorization,
      "ai_rules?select=id,employee_id,rule_type,rule_value,start_date,end_date&order=rule_type.asc&limit=200",
    ),
    supabaseRequest<unknown[]>(
      authorization,
      `schedules?select=id,week_start,status,schedule_entries(employee_id,shift_date,shift_code)&week_start=gte.${scheduleStart}&order=week_start.asc&limit=12`,
    ),
  ]);

  return { today: start, employees, pto, rules, schedules };
}

async function askOpenAI(
  message: string,
  pathname: string,
  history: Array<{ role: string; text: string }>,
  snapshot: unknown,
) {
  const apiKey = environment("OPENAI_API_KEY");

  const instructions = `
You are an AI manager assistant inside a workforce scheduling application.
Today is ${today()}.
The manager is currently viewing ${pathname}.

You receive a snapshot of employees, PTO, scheduling rules, schedules, and schedule entries.
Answer questions accurately from that snapshot.

You may propose ONE of these write actions:
- add_employee
- update_employee
- add_pto
- add_rule
- change_shift

Never claim a write happened. Writes require manager approval.
For read-only questions, use type "answer".
For unsupported requests, use type "answer" and explain what the app can and cannot do.

Dates must be YYYY-MM-DD.
Shift codes must be one of: ${SHIFT_CODES.join(", ")}.
For change_shift, include employee, shift_date, and shift_code.
For add_pto, include employee, start_date, end_date, reason, status.
For add_employee, include employee_name, employee_id, position, status, hire_date.
For update_employee, include employee plus only the fields to change.
For add_rule, include employee (optional), rule_type, rule_value, start_date, end_date.

Return only valid JSON with this exact shape:
{
  "type": "answer or action name",
  "reply": "helpful response to the manager",
  "description": "plain English description of the proposed change, blank for answer",
  "payload": {}
}
`;

  const input = JSON.stringify({
    manager_message: message,
    recent_history: history,
    current_data: snapshot,
  });

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-5-mini",
      instructions,
      input,
      max_output_tokens: 1200,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI request failed: ${await response.text()}`);
  }

  const data = (await response.json()) as {
    output_text?: string;
    output?: Array<{
      content?: Array<{ type?: string; text?: string }>;
    }>;
  };

  const outputText =
    data.output_text ||
    data.output
      ?.flatMap((item) => item.content || [])
      .map((item) => item.text || "")
      .join("") ||
    "";

  if (!outputText) {
    throw new Error("The AI returned an empty response.");
  }

  return JSON.parse(cleanJson(outputText)) as {
    type: string;
    reply: string;
    description?: string;
    payload?: Record<string, unknown>;
  };
}

async function executeAction(
  authorization: string,
  action: AssistantAction,
) {
  const payload = action.payload || {};

  switch (action.type) {
    case "add_employee": {
      const employeeName = String(payload.employee_name || "").trim();
      if (!employeeName) throw new Error("Employee name is required.");

      await supabaseRequest(
        authorization,
        "employees",
        {
          method: "POST",
          body: JSON.stringify({
            employee_name: employeeName,
            employee_id: payload.employee_id || null,
            position: payload.position || "ASR II",
            status: payload.status || "Active",
            hire_date: payload.hire_date || null,
          }),
        },
      );

      return `Added ${employeeName}.`;
    }

    case "update_employee": {
      const employee = await findEmployee(
        authorization,
        payload.employee,
      );

      const update: Record<string, unknown> = {};
      for (const field of [
        "employee_name",
        "employee_id",
        "position",
        "status",
        "hire_date",
      ]) {
        if (field in payload) update[field] = payload[field] || null;
      }

      if (Object.keys(update).length === 0) {
        throw new Error("No employee changes were provided.");
      }

      await supabaseRequest(
        authorization,
        `employees?id=eq.${encodeURIComponent(employee.id)}`,
        {
          method: "PATCH",
          body: JSON.stringify(update),
        },
      );

      return `Updated ${employee.employee_name}.`;
    }

    case "add_pto": {
      const employee = await findEmployee(
        authorization,
        payload.employee,
      );
      const startDate = String(payload.start_date || "");
      const endDate = String(payload.end_date || "");

      if (!startDate || !endDate || endDate < startDate) {
        throw new Error("Valid PTO start and end dates are required.");
      }

      await supabaseRequest(
        authorization,
        "employee_time_off",
        {
          method: "POST",
          body: JSON.stringify({
            employee_id: employee.id,
            start_date: startDate,
            end_date: endDate,
            reason: payload.reason || null,
            status: payload.status || "Approved",
          }),
        },
      );

      return `Added PTO for ${employee.employee_name} from ${startDate} through ${endDate}.`;
    }

    case "add_rule": {
      let employeeId: string | null = null;

      if (payload.employee) {
        employeeId = (
          await findEmployee(authorization, payload.employee)
        ).id;
      }

      const ruleType = String(payload.rule_type || "").trim();
      const ruleValue = String(payload.rule_value || "").trim();

      if (!ruleType || !ruleValue) {
        throw new Error("Rule type and rule value are required.");
      }

      await supabaseRequest(
        authorization,
        "ai_rules",
        {
          method: "POST",
          body: JSON.stringify({
            employee_id: employeeId,
            store_id: null,
            rule_type: ruleType,
            rule_value: ruleValue,
            start_date: payload.start_date || null,
            end_date: payload.end_date || null,
          }),
        },
      );

      return "The scheduling rule was added.";
    }

    case "change_shift": {
      const employee = await findEmployee(
        authorization,
        payload.employee,
      );
      const shiftDate = String(payload.shift_date || "");
      const shiftCode = String(payload.shift_code || "");
      const weekStart = mondayFor(shiftDate);

      if (!shiftDate || !SHIFT_CODES.includes(shiftCode as never)) {
        throw new Error("A valid date and shift code are required.");
      }

      const schedules = await supabaseRequest<Array<{ id: string }>>(
        authorization,
        `schedules?select=id&week_start=eq.${weekStart}&limit=1`,
      );

      if (schedules.length === 0) {
        throw new Error(
          `There is no schedule created for the week of ${weekStart}. Create or generate that week first.`,
        );
      }

      const scheduleId = schedules[0].id;
      const existing = await supabaseRequest<Array<{ id: string }>>(
        authorization,
        `schedule_entries?select=id&schedule_id=eq.${encodeURIComponent(
          scheduleId,
        )}&employee_id=eq.${encodeURIComponent(
          employee.id,
        )}&shift_date=eq.${shiftDate}&limit=1`,
      );

      if (existing.length > 0) {
        await supabaseRequest(
          authorization,
          `schedule_entries?id=eq.${encodeURIComponent(existing[0].id)}`,
          {
            method: "PATCH",
            body: JSON.stringify({ shift_code: shiftCode }),
          },
        );
      } else {
        await supabaseRequest(
          authorization,
          "schedule_entries",
          {
            method: "POST",
            body: JSON.stringify({
              schedule_id: scheduleId,
              employee_id: employee.id,
              shift_date: shiftDate,
              shift_code: shiftCode,
            }),
          },
        );
      }

      return `Changed ${employee.employee_name} to ${shiftCode} on ${shiftDate}.`;
    }

    default:
      throw new Error(`Unsupported action: ${action.type}`);
  }
}

export async function POST(request: NextRequest) {
  try {
    const authentication = await verifyUser(request);

    if (!authentication) {
      return NextResponse.json(
        { success: false, error: "Manager authentication required." },
        { status: 401 },
      );
    }

    const body = (await request.json()) as {
      message?: string;
      pathname?: string;
      history?: Array<{ role: string; text: string }>;
      approvedAction?: AssistantAction;
    };

    if (body.approvedAction) {
      const reply = await executeAction(
        authentication.authorization,
        body.approvedAction,
      );

      return NextResponse.json({ success: true, reply });
    }

    const message = String(body.message || "").trim();
    if (!message) {
      return NextResponse.json(
        { success: false, error: "Enter a request for the assistant." },
        { status: 400 },
      );
    }

    const snapshot = await loadSnapshot(authentication.authorization);
    const result = await askOpenAI(
      message,
      body.pathname || "/",
      body.history || [],
      snapshot,
    );

    if (result.type === "answer") {
      return NextResponse.json({
        success: true,
        reply: result.reply,
      });
    }

    const proposedAction: AssistantAction = {
      type: result.type,
      description:
        result.description ||
        "Apply the requested change to the scheduling system.",
      payload: result.payload || {},
    };

    return NextResponse.json({
      success: true,
      reply:
        result.reply ||
        "I prepared this change. Review and approve it before I save it.",
      proposedAction,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unexpected AI assistant error.",
      },
      { status: 500 },
    );
  }
}
