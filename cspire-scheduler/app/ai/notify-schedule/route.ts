import { NextRequest, NextResponse } from "next/server";

type Employee = {
  id: string;
  employee_name: string;
  phone: string | null;
  notify_sms: boolean | null;
  status: string | null;
};

function requiredEnvironment(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing server environment variable: ${name}`);
  }

  return value;
}

async function verifyManager(request: NextRequest) {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return false;
  }

  const supabaseUrl = requiredEnvironment("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = requiredEnvironment("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: anonKey,
      Authorization: authorization,
    },
    cache: "no-store",
  });

  return response.ok;
}

async function supabaseRest<T>(path: string): Promise<T> {
  const supabaseUrl = requiredEnvironment("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY");

  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `Supabase request failed: ${response.status} ${await response.text()}`,
    );
  }

  return (await response.json()) as T;
}

async function sendSms(to: string, body: string) {
  const accountSid = requiredEnvironment("TWILIO_ACCOUNT_SID");
  const authToken = requiredEnvironment("TWILIO_AUTH_TOKEN");
  const fromNumber = requiredEnvironment("TWILIO_PHONE_NUMBER");

  const form = new URLSearchParams({
    To: to,
    From: fromNumber,
    Body: body,
  });

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(
          `${accountSid}:${authToken}`,
        ).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    },
  );

  if (!response.ok) {
    throw new Error(`SMS failed for ${to}: ${await response.text()}`);
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!(await verifyManager(request))) {
      return NextResponse.json(
        { success: false, message: "Manager authentication required." },
        { status: 401 },
      );
    }

    const body = (await request.json()) as { weekStart?: string };
    const weekStart = body.weekStart;

    if (!weekStart || !/^\\d{4}-\\d{2}-\\d{2}$/.test(weekStart)) {
      return NextResponse.json(
        { success: false, message: "A valid weekStart date is required." },
        { status: 400 },
      );
    }

    const encodedWeek = encodeURIComponent(weekStart);
    const schedules = await supabaseRest<Array<{ id: string }>>(
      `schedules?select=id&week_start=eq.${encodedWeek}&status=eq.Published&limit=1`,
    );

    if (schedules.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message: "Publish the schedule before sending notifications.",
        },
        { status: 400 },
      );
    }

    const employees = await supabaseRest<Employee[]>(
      "employees?select=id,employee_name,phone,notify_sms,status&or=(status.eq.Active,status.is.null)&order=employee_name.asc",
    );

    const origin =
      process.env.NEXT_PUBLIC_SITE_URL ||
      new URL(request.url).origin;

    const teamLink = `${origin}/team-schedule?week=${weekStart}`;
    const smsBody = `Your work schedule for the week of ${weekStart} is published: ${teamLink}`;

    let smsSent = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const employee of employees) {
      let sentForEmployee = false;

      if (employee.notify_sms !== false && employee.phone) {
        try {
          await sendSms(employee.phone, smsBody);
          smsSent += 1;
          sentForEmployee = true;
        } catch (error) {
          errors.push(
            error instanceof Error ? error.message : String(error),
          );
        }
      }

      if (!sentForEmployee) {
        skipped += 1;
      }
    }

    return NextResponse.json({
      success: errors.length === 0,
      message:
        errors.length === 0
          ? "Text notifications sent successfully."
          : "Some text notifications could not be sent.",
      emailSent: 0,
      smsSent,
      skipped,
      errors,
    }, { status: errors.length === 0 ? 200 : 207 });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Unexpected notification error.",
      },
      { status: 500 },
    );
  }
}
