// India-only for now: users type 10 digits, we store 10 digits, and prefix +91 only for display/WA/synthetic email.
export function digits10(phone: string): string {
  return phone.replace(/\D/g, "").slice(-10);
}

export function normalizePhone(phone: string): string {
  return digits10(phone);
}

export function phoneToEmail(phone: string): string {
  return `91${digits10(phone)}@stockflow.local`;
}

export function displayPhone(phone: string): string {
  const d = digits10(phone);
  return d ? `+91 ${d}` : "";
}

export function waLink(phone: string, message: string): string {
  return `https://wa.me/91${digits10(phone)}?text=${encodeURIComponent(message)}`;
}
