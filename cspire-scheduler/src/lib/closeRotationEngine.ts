export function getLowestCloseCount(
  employees: any[],
  field: string
) {
  const sorted = [...employees];

  sorted.sort(
    (a, b) =>
      (a[field] || 0) -
      (b[field] || 0)
  );

  return sorted[0];
}