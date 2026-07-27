export function isJustin(
  employeeName: string
) {
  return (
    employeeName ===
    "Justin Hemphill"
  );
}

export function getSaturdayGoal(
  employeeName: string
) {
  if (isJustin(employeeName)) {
    return 2;
  }

  return 1;
}

export function useJustinAsBuffer() {
  return true;
}