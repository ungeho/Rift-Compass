const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** 保存WikiのISO日時・HTTP Last-ModifiedをUTC日付で表示する。原文は変更しない。 */
export function wikiUpdatedDate(value: unknown): string {
  if (value === null || value === undefined || value === "") return "不明";
  if (typeof value !== "string") return "更新日時不正";
  const text = value.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/.exec(text);
  const http = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), (\d{2}) ([A-Z][a-z]{2}) (\d{4}) \d{2}:\d{2}:\d{2} GMT$/.exec(text);
  if (!iso && !http) return "更新日時不正";
  const year = Number(iso ? iso[1] : http![4]);
  const month = iso ? Number(iso[2]) : MONTHS.indexOf(http![3]) + 1;
  const day = Number(iso ? iso[3] : http![2]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  // Dateだけでは11月31日等が翌月に補正されるため、変換前の暦日を検査する。
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1]) return "更新日時不正";
  const date = new Date(text);
  if (!Number.isFinite(date.getTime())) return "更新日時不正";
  // HTTP-dateはGMT。曜日や2桁年への読み替えも原文の日時として受け入れない。
  if (http && (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day ||
    ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][date.getUTCDay()] !== http[1])) return "更新日時不正";
  return date.toISOString().slice(0, 10);
}
