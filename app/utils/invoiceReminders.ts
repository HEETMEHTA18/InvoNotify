export const REMINDER_OFFSET_OPTIONS = [7, 3, 1, 0] as const;
export const REMINDER_CHANNEL_OPTIONS = ["EMAIL", "SMS", "BOTH"] as const;
const MAX_REMINDER_OFFSET_DAYS = 30;

export type ReminderChannel = (typeof REMINDER_CHANNEL_OPTIONS)[number];

export type ReminderType = "BEFORE_DUE" | "DUE_DATE" | "OVERDUE_REPEAT" | "MANUAL";

export interface ReminderSettingsInput {
  autoReminderEnabled?: unknown;
  reminderOffsets?: unknown;
  overdueReminderEnabled?: unknown;
  overdueReminderEveryDays?: unknown;
  reminderChannel?: unknown;
  dueDate?: string | Date | null;
}

export interface NormalizedReminderSettings {
  autoReminderEnabled: boolean;
  reminderOffsets: number[];
  overdueReminderEnabled: boolean;
  overdueReminderEveryDays: number;
  reminderChannel: ReminderChannel;
}

export interface ScheduledReminderMatch {
  reminderType: ReminderType;
  reminderKey: string;
  targetDate: Date;
  daysUntilDue: number;
  daysOverdue: number;
}

function startOfUtcDay(input: Date) {
  return new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()));
}

function toDayKey(input: Date) {
  return startOfUtcDay(input).toISOString().slice(0, 10);
}

export function normalizeReminderOffsets(value: unknown) {
  if (!Array.isArray(value)) return [];

  const unique = new Set<number>();
  for (const raw of value) {
    const parsed = Number(raw);
    if (!Number.isInteger(parsed)) continue;
    if (parsed < 0 || parsed > MAX_REMINDER_OFFSET_DAYS) continue;
    unique.add(parsed);
  }

  return Array.from(unique).sort((a, b) => b - a);
}

export function normalizeReminderChannel(value: unknown): ReminderChannel {
  const raw = String(value || "").toUpperCase().trim();
  if (raw === "SMS" || raw === "BOTH") return raw;
  return "EMAIL";
}

export function normalizeReminderSettings(input: ReminderSettingsInput): NormalizedReminderSettings {
  const dueDate = input.dueDate ? new Date(input.dueDate) : null;
  const hasValidDueDate = !!dueDate && !Number.isNaN(dueDate.getTime());
  const rawOffsets = normalizeReminderOffsets(input.reminderOffsets);
  const parsedEveryDays = Number(input.overdueReminderEveryDays);
  const reminderChannel = normalizeReminderChannel(input.reminderChannel);

  const autoReminderEnabled = Boolean(input.autoReminderEnabled) && hasValidDueDate;
  const reminderOffsets = autoReminderEnabled ? rawOffsets : [];
  const overdueReminderEveryDays = Number.isInteger(parsedEveryDays)
    ? Math.min(30, Math.max(1, parsedEveryDays))
    : 3;
  const overdueReminderEnabled = autoReminderEnabled && Boolean(input.overdueReminderEnabled);

  return {
    autoReminderEnabled,
    reminderOffsets,
    overdueReminderEnabled,
    overdueReminderEveryDays,
    reminderChannel,
  };
}

export function getReminderMatchForDate(args: {
  dueDate: Date | null;
  reminderOffsets: number[];
  overdueReminderEnabled: boolean;
  overdueReminderEveryDays: number;
  now?: Date;
}): ScheduledReminderMatch | null {
  const {
    dueDate,
    reminderOffsets,
    overdueReminderEnabled,
    overdueReminderEveryDays,
    now = new Date(),
  } = args;

  if (!dueDate || Number.isNaN(dueDate.getTime())) return null;

  const dueDay = startOfUtcDay(dueDate);
  const today = startOfUtcDay(now);
  const msPerDay = 24 * 60 * 60 * 1000;
  const daysUntilDue = Math.round((dueDay.getTime() - today.getTime()) / msPerDay);

  if (daysUntilDue >= 0 && reminderOffsets.includes(daysUntilDue)) {
    const reminderType: ReminderType = daysUntilDue === 0 ? "DUE_DATE" : "BEFORE_DUE";
    return {
      reminderType,
      reminderKey: `${reminderType}-${daysUntilDue}-${toDayKey(dueDay)}`,
      targetDate: today,
      daysUntilDue,
      daysOverdue: 0,
    };
  }

  if (daysUntilDue < 0 && overdueReminderEnabled) {
    const daysOverdue = Math.abs(daysUntilDue);
    const every = Math.max(1, overdueReminderEveryDays);
    if (daysOverdue % every === 0) {
      return {
        reminderType: "OVERDUE_REPEAT",
        reminderKey: `OVERDUE-${daysOverdue}-${toDayKey(dueDay)}`,
        targetDate: today,
        daysUntilDue,
        daysOverdue,
      };
    }
  }

  return null;
}

export function getReminderSubject(args: {
  invoiceNumber: string;
  reminderType: ReminderType;
  daysUntilDue: number;
  daysOverdue: number;
}) {
  const { invoiceNumber, reminderType, daysUntilDue, daysOverdue } = args;

  if (reminderType === "BEFORE_DUE") {
    const suffix = daysUntilDue === 1 ? "day" : "days";
    return `Reminder: Invoice #${invoiceNumber} is due in ${daysUntilDue} ${suffix}`;
  }
  if (reminderType === "DUE_DATE") {
    return `Due Today: Invoice #${invoiceNumber}`;
  }
  if (reminderType === "OVERDUE_REPEAT") {
    const suffix = daysOverdue === 1 ? "day" : "days";
    return `Overdue Reminder: Invoice #${invoiceNumber} (${daysOverdue} ${suffix} overdue)`;
  }

  return `Payment Reminder: Invoice #${invoiceNumber}`;
}
