/**
 * ISO 6346 container number check-digit logic (mirror of the backend).
 *
 * Digits map to themselves. Uppercase letters are assigned 10, 12, 13,
 * ... 38 in alphabetical order, skipping every multiple of 11 (11, 22, 33).
 */

export const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const SKIPPED_VALUES = new Set([11, 22, 33]);

function buildLetterValues(): Record<string, number> {
  const table: Record<string, number> = {};
  let value = 10;
  for (const letter of LETTERS) {
    while (SKIPPED_VALUES.has(value)) {
      value += 1;
    }
    table[letter] = value;
    value += 1;
  }
  return table;
}

export const LETTER_VALUES: Readonly<Record<string, number>> =
  buildLetterValues();

export function characterValue(character: string): number {
  if (character >= "0" && character <= "9") {
    return Number(character);
  }
  const value = LETTER_VALUES[character];
  if (value === undefined) {
    throw new Error(`Invalid character: ${character}`);
  }
  return value;
}

/** Compute the expected check digit for the first ten characters. */
export function expectedCheckDigit(
  ownerCode: string,
  category: string,
  serial: string,
): string {
  const code = `${ownerCode}${category}${serial}`;
  let total = 0;
  for (let index = 0; index < code.length; index += 1) {
    total += characterValue(code[index]) * 2 ** index;
  }
  const remainder = total % 11;
  return remainder === 10 ? "0" : String(remainder);
}

export interface ContainerFields {
  ownerCode: string;
  category: string;
  serial: string;
  checkDigit: string;
}

export type FieldName = keyof ContainerFields;
export type FieldErrors = Partial<Record<FieldName, string>>;

export const FIELD_PATTERNS: Record<FieldName, RegExp> = {
  ownerCode: /^[A-Z]{3}$/,
  category: /^[UJZ]$/,
  serial: /^[0-9]{6}$/,
  checkDigit: /^[0-9]$/,
};

export function validateFields(fields: ContainerFields): FieldErrors {
  const errors: FieldErrors = {};
  (Object.keys(FIELD_PATTERNS) as FieldName[]).forEach((name) => {
    if (!FIELD_PATTERNS[name].test(fields[name])) {
      errors[name] = FIELD_LABELS[name];
    }
  });
  return errors;
}

export const FIELD_LABELS: Record<FieldName, string> = {
  ownerCode: "所有者代码须为 3 位大写字母（A–Z）",
  category: "类别符号只能是 U、J、Z",
  serial: "序列号须为 6 位数字",
  checkDigit: "校验位须为 1 位数字",
};
