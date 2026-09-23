export function capitalizePersonName(value?: string | null): string {
  const normalized = (value ?? '').trim().replace(/\s+/g, ' ');

  return normalized
    .split(/([\s'-]+)/)
    .map((part) => {
      if (!part || /^[\s'-]+$/.test(part)) return part;

      const lower = part.toLocaleLowerCase();
      const upper = part.toLocaleUpperCase();
      if (part !== lower && part !== upper) return part;

      return lower.charAt(0).toLocaleUpperCase() + lower.slice(1);
    })
    .join('');
}
