// Phone field that formats as you type: 5551234567 -> 555-123-4567.
export function formatPhone(value) {
  const d = String(value ?? '').replace(/\D/g, '').slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
}

// Empty is allowed (the phone is optional); otherwise it must be 123-456-7890.
export const phoneError = (value) =>
  value && !/^\d{3}-\d{3}-\d{4}$/.test(value) ? 'Enter the phone number as 123-456-7890.' : '';

export default function PhoneInput({ value, onChange, ...rest }) {
  return (
    <input
      type="tel"
      inputMode="numeric"
      placeholder="123-456-7890"
      maxLength={12}
      pattern="\d{3}-\d{3}-\d{4}"
      value={value}
      onChange={(e) => onChange(formatPhone(e.target.value))}
      {...rest}
    />
  );
}
