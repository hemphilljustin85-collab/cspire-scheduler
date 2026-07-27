export type RuleRecord = {
  rule_type: string;
  rule_text: string;
};

export function hasNoCloseRule(
  employeeName: string,
  rules: RuleRecord[]
) {
  return rules.some(
    (rule) =>
      rule.rule_type === "NO_CLOSE" &&
      rule.rule_text.includes(employeeName)
  );
}

export function hasNoOpenRule(
  employeeName: string,
  rules: RuleRecord[]
) {
  return rules.some(
    (rule) =>
      rule.rule_type === "NO_OPEN" &&
      rule.rule_text.includes(employeeName)
  );
}

export function hasSaturdayOffRule(
  employeeName: string,
  rules: RuleRecord[]
) {
  return rules.some(
    (rule) =>
      rule.rule_type === "SATURDAY_OFF" &&
      rule.rule_text.includes(employeeName)
  );
}