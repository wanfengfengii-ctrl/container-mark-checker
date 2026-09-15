import type { ContainerFields } from "./validation";

export interface VerifyResponse {
  valid: boolean;
  expected_check_digit: string;
  actual_check_digit: string;
  container_number: string;
}

export interface ApiFieldError {
  loc: (string | number)[];
  msg: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly fieldErrors: Partial<Record<keyof ContainerFields, string>>;

  constructor(status: number, body: unknown) {
    super(`Verification request failed with status ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.fieldErrors = 422 === status ? collectFieldErrors(body) : {};
  }
}

function collectFieldErrors(
  body: unknown,
): Partial<Record<keyof ContainerFields, string>> {
  const collected: Partial<Record<keyof ContainerFields, string>> = {};
  const details = (body as { detail?: ApiFieldError[] } | null)?.detail;
  if (!Array.isArray(details)) {
    return collected;
  }
  for (const error of details) {
    const field = error.loc[error.loc.length - 1];
    if ("string" === typeof field && field in FIELD_NAMES) {
      collected[field as keyof ContainerFields] = error.msg;
    }
  }
  return collected;
}

const FIELD_NAMES: Record<string, true> = {
  owner_code: true,
  category: true,
  serial: true,
  check_digit: true,
};

export async function verifyNumber(
  fields: ContainerFields,
): Promise<VerifyResponse> {
  const response = await fetch("/api/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      owner_code: fields.ownerCode,
      category: fields.category,
      serial: fields.serial,
      check_digit: fields.checkDigit,
    }),
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(response.status, body);
  }
  return body as VerifyResponse;
}
