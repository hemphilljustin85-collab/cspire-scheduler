// Phone numbers for sign-in recovery are stored by Supabase in E.164 form (+16015551234).

/** Turns what someone typed ("(601) 555-1234", "601-555-1234", "+1 601…") into +1XXXXXXXXXX, or null. */
export function toE164(input: string): string | null {
  const trimmed = input.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+")) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

/** "16015551234" or "+16015551234" → "(601) 555-1234"; other numbers shown as +digits. */
export function formatPhone(value: string | null | undefined): string {
  if (!value) return "";
  const digits = value.replace(/\D/g, "");
  const us = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits.length === 10 ? digits : null;
  if (us) return `(${us.slice(0, 3)}) ${us.slice(3, 6)}-${us.slice(6)}`;
  return `+${digits}`;
}

/** Friendlier wording for the errors Supabase gives when phone sign-in isn't set up. */
export function phoneErrorMessage(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("unsupported phone provider") || lower.includes("phone provider") || lower.includes("sms provider") || lower.includes("phone signups are disabled"))
    return "Text-message codes aren't turned on for this app yet. Use email for now, or ask the store manager to turn them on.";
  if (lower.includes("signups not allowed") || lower.includes("user not found"))
    return "No account has that phone number. Add it under Settings → Recovery phone first, or reset by email.";
  if (lower.includes("expired") || lower.includes("invalid"))
    return "That code is wrong or has expired. Check the text, or send a new code.";
  if (lower.includes("rate limit") || lower.includes("security purposes"))
    return "Too many codes were sent. Wait a minute and try again.";
  return message;
}
