export function formatIdr(amount: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatNumberWithCommas(value: string) {
  const digits = value.replace(/\D/g, "");

  if (!digits) {
    return "";
  }

  return new Intl.NumberFormat("en-US").format(Number(digits));
}

export function parseFormattedNumber(value: string) {
  return Number(value.replace(/\D/g, ""));
}

export function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

export function monthStart(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}

export function nextMonthStart(date = new Date()) {
  return monthStart(new Date(date.getFullYear(), date.getMonth() + 1, 1));
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

export function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}
