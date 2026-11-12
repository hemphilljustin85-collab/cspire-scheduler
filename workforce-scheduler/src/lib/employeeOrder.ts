// The order people are listed in on the schedule, set by drag and drop.
// Stored as one store-wide ai_rules row (rule_type "employee_order") whose
// rule_value is a JSON array of employee ids, so no database change is needed.

export const EMPLOYEE_ORDER_RULE = "employee_order";

export function parseEmployeeOrder(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Sort people by the saved order. Anyone not in it yet (e.g. a new hire)
 * goes at the end, keeping their current (alphabetical) order.
 */
export function sortByEmployeeOrder<T extends { id: string }>(employees: T[], order: string[]): T[] {
  if (order.length === 0) return employees;
  const position = new Map(order.map((id, index) => [id, index]));
  return employees
    .map((employee, index) => ({ employee, index }))
    .sort((a, b) => {
      const aPos = position.get(a.employee.id) ?? order.length + a.index;
      const bPos = position.get(b.employee.id) ?? order.length + b.index;
      return aPos - bPos;
    })
    .map(({ employee }) => employee);
}
