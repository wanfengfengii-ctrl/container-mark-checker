import { useMemo, useState } from "react";
import { ApiError, verifyNumber } from "./api";
import {
  FIELD_LABELS,
  validateFields,
  type ContainerFields,
  type FieldErrors,
  type FieldName,
} from "./validation";
import "./App.css";

const EMPTY_FIELDS: ContainerFields = {
  ownerCode: "",
  category: "",
  serial: "",
  checkDigit: "",
};

type Verdict =
  | { status: "pass" }
  | { status: "fail"; actual: string; expected: string };

interface FieldSpec {
  name: FieldName;
  label: string;
  maxLength: number;
  inputMode: "text" | "numeric";
  placeholder: string;
  autoUpper: boolean;
  width: string;
}

const FIELD_SPECS: FieldSpec[] = [
  {
    name: "ownerCode",
    label: "所有者代码（3 位 A–Z）",
    maxLength: 3,
    inputMode: "text",
    placeholder: "CSQ",
    autoUpper: true,
    width: "7.5rem",
  },
  {
    name: "category",
    label: "类别（U / J / Z）",
    maxLength: 1,
    inputMode: "text",
    placeholder: "U",
    autoUpper: true,
    width: "3.5rem",
  },
  {
    name: "serial",
    label: "序列号（6 位数字）",
    maxLength: 6,
    inputMode: "numeric",
    placeholder: "305438",
    autoUpper: false,
    width: "11rem",
  },
  {
    name: "checkDigit",
    label: "校验位（1 位数字）",
    maxLength: 1,
    inputMode: "numeric",
    placeholder: "3",
    autoUpper: false,
    width: "3.5rem",
  },
];

export default function App() {
  const [fields, setFields] = useState<ContainerFields>(EMPTY_FIELDS);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Errors are recomputed live on every keystroke, and changing any field
  // wipes the previous verdict so a stale green light can never remain.
  const errors: FieldErrors = useMemo(() => validateFields(fields), [fields]);
  const formValid = Object.keys(errors).length === 0;

  function handleChange(name: FieldName, rawValue: string, upper: boolean) {
    const value = upper ? rawValue.toUpperCase() : rawValue;
    setFields((previous) => ({ ...previous, [name]: value }));
    setVerdict(null);
    setSubmitError(null);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setVerdict(null);
    setSubmitError(null);
    if (!formValid) {
      return;
    }
    setSubmitting(true);
    try {
      const result = await verifyNumber(fields);
      if (result.valid) {
        setVerdict({ status: "pass" });
      } else {
        setVerdict({
          status: "fail",
          actual: result.actual_check_digit,
          expected: result.expected_check_digit,
        });
      }
    } catch (error) {
      if (error instanceof ApiError && 422 === error.status) {
        // Server-side rejection maps back to fields; any prior PASS is
        // already cleared by setVerdict(null) above.
        setSubmitError("服务器驳回了非法字段，请按字段提示更正。");
      } else {
        setSubmitError("无法连接校验服务，请稍后重试。");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="page">
      <h1>闸口集装箱箱号校验</h1>
      <p className="hint">按箱体标识分段抄录，任一字段非法时不会放行。</p>

      <form onSubmit={handleSubmit} noValidate aria-label="箱号校验表单">
        <div className="fields">
          {FIELD_SPECS.map((spec) => (
            <div className="field" key={spec.name}>
              <label htmlFor={spec.name}>{spec.label}</label>
              <input
                id={spec.name}
                name={spec.name}
                style={{ width: spec.width }}
                value={fields[spec.name]}
                maxLength={spec.maxLength}
                inputMode={spec.inputMode}
                placeholder={spec.placeholder}
                aria-invalid={Boolean(errors[spec.name])}
                aria-describedby={
                  errors[spec.name] ? `${spec.name}-error` : undefined
                }
                onChange={(event) =>
                  handleChange(
                    spec.name,
                    event.target.value,
                    spec.autoUpper,
                  )
                }
              />
              {errors[spec.name] && (
                <p
                  id={`${spec.name}-error`}
                  data-testid={`${spec.name}-error`}
                  className="field-error"
                  role="alert"
                >
                  {FIELD_LABELS[spec.name]}
                </p>
              )}
            </div>
          ))}
        </div>

        <button type="submit" disabled={submitting}>
          {submitting ? "校验中…" : "提交校验"}
        </button>
      </form>

      {submitError && (
        <section className="result error" role="alert" aria-live="assertive">
          {submitError}
        </section>
      )}

      <section className="result-slot" aria-live="assertive">
        {verdict?.status === "pass" && (
          <div className="result pass" data-testid="verdict">
            <strong>PASS</strong>
          </div>
        )}
        {verdict?.status === "fail" && (
          <div className="result fail" data-testid="verdict">
            <strong>FAIL</strong>
            <p>
              实填校验位：<span data-testid="actual">{verdict.actual}</span>
            </p>
            <p>
              唯一期望校验位：
              <span data-testid="expected">{verdict.expected}</span>
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
