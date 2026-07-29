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

const SHIFT_DETAILS: Record<
  (typeof SHIFT_CODES)[number],
  { start_time: string | null; end_time: string | null; hours: number }
> = {
  OFF: { start_time: null, end_time: null, hours: 0 },
  PTO: { start_time: null, end_time: null, hours: 8 },
  HOLIDAY: { start_time: null, end_time: null, hours: 8 },
  "815-530": { start_time: "08:15", end_time: "17:30", hours: 8.25 },
  "830-530": { start_time: "08:30", end_time: "17:30", hours: 8 },
  "900-600": { start_time: "09:00", end_time: "18:00", hours: 8 },
  "1030-715": { start_time: "10:30", end_time: "19:15", hours: 7.75 },
};

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
      `schedules?select=id,week_start,status,schedule_entries(employee_id,shift_date,shift_code,hours)&week_start=gte.${scheduleStart}&order=week_start.asc&limit=12`,
    ),
  ]);

  return { today: start, employees, pto, rules, schedules };
}

function weekdayDate(dayName: string, nextWeek: boolean) {
  const weekdays: Record<string, number> = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
  };
  const target = weekdays[dayName.toLowerCase()];
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  const distance = (target - date.getDay() + 7) % 7;
  date.setDate(date.getDate() + distance + (nextWeek ? 7 : 0));
  return date.toISOString().slice(0, 10);
}

async function askFreeHelper(
  message: string,
  _pathname: string,
  _history: Array<{ role: string; text: string }>,
  snapshot: unknown,
) {
  const data = snapshot as {
    employees: Array<{
      id: string;
      employee_name: string;
      employee_id?: string | null;
      position?: string | null;
      status?: string | null;
    }>;
    pto: Array<{
      employee_id: string;
      start_date: string;
      end_date: string;
      status?: string | null;
    }>;
    rules: Array<{ rule_type: string; rule_value: string }>;
    schedules: Array<{
      week_start: string;
      status: string;
      schedule_entries?: Array<{
        employee_id: string;
        shift_date: string;
        shift_code: string;
        hours?: number;
      }>;
    }>;
  };
  const text = message.trim();
  const lower = text.toLowerCase();

  const datedShift = text.match(
    /(?:give|set|change)\s+(.+?)\s+(?:on\s+)?(\d{4}-\d{2}-\d{2})\s+(?:off|to\s+([a-z0-9-]+))/i,
  );
  if (datedShift) {
    const shiftCode = lower.includes(`${datedShift[2]} off`)
      ? "OFF"
      : datedShift[3].toUpperCase();
    return {
      type: "change_shift",
      reply: "I prepared that shift change for your approval.",
      description: `Set ${datedShift[1]} to ${shiftCode} on ${datedShift[2]}.`,
      payload: {
        employee: datedShift[1],
        shift_date: datedShift[2],
        shift_code: shiftCode,
      },
    };
  }

  const weekdayShift = text.match(
    /(?:give|set|change)\s+(.+?)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+(off|to\s+[a-z0-9-]+)(?:\s+(next week))?/i,
  );
  if (weekdayShift) {
    const shiftCode = weekdayShift[3].toLowerCase() === "off"
      ? "OFF"
      : weekdayShift[3].replace(/^to\s+/i, "").toUpperCase();
    const shiftDate = weekdayDate(weekdayShift[2], Boolean(weekdayShift[4]));
    return {
      type: "change_shift",
      reply: "I prepared that shift change for your approval.",
      description: `Set ${weekdayShift[1]} to ${shiftCode} on ${shiftDate}.`,
      payload: {
        employee: weekdayShift[1],
        shift_date: shiftDate,
        shift_code: shiftCode,
      },
    };
  }

  const ptoAction = text.match(
    /add\s+pto\s+for\s+(.+?)\s+from\s+(\d{4}-\d{2}-\d{2})\s+(?:through|to)\s+(\d{4}-\d{2}-\d{2})(?:\s+for\s+(.+))?$/i,
  );
  if (ptoAction) {
    return {
      type: "add_pto",
      reply: "I prepared the PTO request for your approval.",
      description: `Add approved PTO for ${ptoAction[1]} from ${ptoAction[2]} through ${ptoAction[3]}.`,
      payload: {
        employee: ptoAction[1],
        start_date: ptoAction[2],
        end_date: ptoAction[3],
        reason: ptoAction[4] || null,
        status: "Approved",
      },
    };
  }

  const employeeAction = text.match(
    /add\s+(?:a\s+)?(?:new\s+)?employee(?:\s+named)?\s+(.+?)(?:\s+as\s+(.+))?$/i,
  );
  if (employeeAction) {
    return {
      type: "add_employee",
      reply: "I prepared the new employee for your approval.",
      description: `Add ${employeeAction[1]} as ${employeeAction[2] || "ASR II"}.`,
      payload: {
        employee_name: employeeAction[1],
        position: employeeAction[2] || "ASR II",
        status: "Active",
      },
    };
  }

  if (lower.includes("pto")) {
    const employeeNames = new Map(
      data.employees.map((employee) => [employee.id, employee.employee_name]),
    );
    const approved = data.pto.filter(
      (item) => (item.status || "Approved").toLowerCase() === "approved",
    );
    return {
      type: "answer",
      reply: approved.length
        ? approved
            .map(
              (item) =>
                `${employeeNames.get(item.employee_id) || "Employee"}: ${item.start_date} through ${item.end_date}`,
            )
            .join("\n")
        : "There is no approved upcoming PTO.",
      description: "",
      payload: {},
    };
  }

  if (lower.includes("rule")) {
    return {
      type: "answer",
      reply: data.rules.length
        ? data.rules
            .map((rule) => `${rule.rule_type}: ${rule.rule_value}`)
            .join("\n")
        : "No scheduling rules are currently saved.",
      description: "",
      payload: {},
    };
  }

  if (lower.includes("employee") || lower.includes("staff") || lower.includes("team")) {
    const active = data.employees.filter(
      (employee) => (employee.status || "Active").toLowerCase() === "active",
    );
    return {
      type: "answer",
      reply: active.length
        ? `${active.length} active employees:\n${active
            .map(
              (employee) =>
                `${employee.employee_name}${employee.position ? ` — ${employee.position}` : ""}`,
            )
            .join("\n")}`
        : "No active employees were found.",
      description: "",
      payload: {},
    };
  }

  if (lower.includes("schedule") || lower.includes("fair")) {
    const schedule = data.schedules[0];
    return {
      type: "answer",
      reply: schedule
        ? `The next saved schedule starts ${schedule.week_start}, is ${schedule.status}, and contains ${schedule.schedule_entries?.length || 0} assignments.`
        : "No upcoming saved schedule was found.",
      description: "",
      payload: {},
    };
  }

  if (lower.includes("hour")) {
    const schedule = data.schedules[0];
    if (!schedule) return { type: "answer", reply: "No upcoming schedule was found.", description: "", payload: {} };
    const names = new Map(data.employees.map((employee) => [employee.id, employee.employee_name]));
    const totals = new Map<string, number>();
    for (const entry of schedule.schedule_entries || []) {
      totals.set(entry.employee_id, (totals.get(entry.employee_id) || 0) + Number(entry.hours || 0));
    }
    const requestedLimit = Number(lower.match(/(?:under|below)\s+(\d+(?:\.\d+)?)/)?.[1] || 0);
    const lines = [...totals.entries()]
      .filter(([, hours]) => !requestedLimit || hours < requestedLimit)
      .sort((a, b) => b[1] - a[1])
      .map(([id, hours]) => `${names.get(id) || "Employee"}: ${hours.toFixed(2)} hours`);
    return {
      type: "answer",
      reply: lines.length ? lines.join("\n") : requestedLimit ? `No one is below ${requestedLimit} hours.` : "No scheduled hours were found.",
      description: "",
      payload: {},
    };
  }

  return {
    type: "answer",
    reply:
      "Free mode can list employees, PTO, rules, and upcoming schedules. It can also prepare changes such as “Give Sedrick Friday off next week,” “Add PTO for Shane from 2026-08-04 through 2026-08-06,” or “Add employee John Smith as Repair Tech.” I’ll always ask before saving a change.",
    description: "",
    payload: {},
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

      const builtInShift = SHIFT_CODES.includes(shiftCode as never);
      const customShifts = builtInShift
        ? []
        : await supabaseRequest<Array<{ code: string }>>(
            authorization,
            `shift_templates?select=code&code=eq.${encodeURIComponent(shiftCode)}&active=eq.true&limit=1`,
          );

      if (!shiftDate || (!builtInShift && customShifts.length === 0)) {
        throw new Error("A valid date and shift code are required.");
      }

      const normalizedShift = shiftCode.toUpperCase();
      const shiftValues = builtInShift
        ? {
            shift_code: normalizedShift,
            ...SHIFT_DETAILS[normalizedShift as (typeof SHIFT_CODES)[number]],
            updated_at: new Date().toISOString(),
          }
        : {
            shift_code: normalizedShift,
            updated_at: new Date().toISOString(),
          };

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
            body: JSON.stringify(shiftValues),
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
              ...shiftValues,
            }),
          },
        );
      }

      return `Changed ${employee.employee_name} to ${normalizedShift} on ${shiftDate}.`;
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
    const result = await askFreeHelper(
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
