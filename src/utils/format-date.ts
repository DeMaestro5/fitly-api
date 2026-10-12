const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

export function formatDate(value: string): string {
  if (value === 'present') return 'Present';
  const match = /^(\d{4})(?:-(\d{2}))?$/.exec(value);
  if (!match) return value;
  return match[2] ? `${MONTHS[Number(match[2]) - 1]} ${match[1]}` : match[1];
}

export const formatRange = (start: string, end: string): string =>
  `${formatDate(start)} \u2013 ${formatDate(end)}`;
