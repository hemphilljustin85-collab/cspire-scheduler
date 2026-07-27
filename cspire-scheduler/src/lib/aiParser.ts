export function parseAICommand(
  text: string
) {
  const lower = text.toLowerCase();

  if (
    lower.includes("doesn't need to close")
  ) {
    return {
      rule_type: "NO_CLOSE",
      rule_text: text,
    };
  }

  if (
    lower.includes("doesn't need to open")
  ) {
    return {
      rule_type: "NO_OPEN",
      rule_text: text,
    };
  }

  if (
    lower.includes("saturday off")
  ) {
    return {
      rule_type: "SATURDAY_OFF",
      rule_text: text,
    };
  }

  if (
    lower.includes("vacation") ||
    lower.includes("pto")
  ) {
    return {
      rule_type: "PTO",
      rule_text: text,
    };
  }

  return {
    rule_type: "CUSTOM",
    rule_text: text,
  };
}