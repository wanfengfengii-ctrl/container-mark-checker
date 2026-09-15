import { useMemo, useState } from "react";
import {
  ApiError,
  requestCorrections,
  verifyNumber,
  type CorrectionResponse,
} from "./api";
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

// The "locate suspected miscopy" diagnosis is only reachable from a FAIL
// result. Every keystroke and every new submission discards it so stale
// candidates can never linger against edited input.
type Diagnosis =
  | { status: "loading" }
  | { status: "ready"; result: CorrectionResponse }
  | { status: "error"; message: string };

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

function splitContainerNumber(number: string): ContainerFields {
  return {
    ownerCode: number.slice(0, 3),
    category: number.slice(3, 4),
    serial: number.slice(4, 10),
    checkDigit: number.slice(10, 11),
  };
}

export default function App() {
  const [fields, setFields] = useState<ContainerFields>(EMPTY_FIELDS);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);

  // Errors are recomputed live on every keystroke, and changing any field
  // wipes the previous verdict and diagnosis so a stale green light or a
  // stale candidate list can never remain.
  const errors: FieldErrors = useMemo(() => validateFields(fields), [fields]);
  const formValid = Object.keys(errors).length === 0;

  function handleChange(name: FieldName, rawValue: string, upper: boolean) {
    const value = upper ? rawValue.toUpperCase() : rawValue;
    setFields((previous) => ({ ...previous, [name]: value }));
    setVerdict(null);
    setSubmitError(null);
    setDiagnosis(null);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setVerdict(null);
    setSubmitError(null);
    setDiagnosis(null);
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

  async function handleDiagnose() {
    setDiagnosis({ status: "loading" });
    try {
      const result = await requestCorrections(fields);
      // Any response — including an empty candidate list — replaces the
      // previous candidates outright.
      setDiagnosis({ status: "ready", result });
    } catch (error) {
      setDiagnosis({
        status: "error",
        message:
          error instanceof ApiError && 409 === error.status
            ? "该箱号已通过校验，无需定位疑似抄错。"
            : "诊断服务暂不可用，请稍后重试。",
      });
    }
  }

  function handlePickCandidate(number: string) {
    // Refill all four segments from the chosen number and clear every old
    // conclusion; resubmission then follows the normal PASS/FAIL rules.
    setFields(splitContainerNumber(number));
    setVerdict(null);
    setSubmitError(null);
    setDiagnosis(null);
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
            {diagnosis === null && (
              <button
                type="button"
                className="diagnose-button"
                data-testid="diagnose"
                onClick={handleDiagnose}
              >
                定位疑似抄错
              </button>
            )}
          </div>
        )}

        {verdict?.status === "fail" && diagnosis !== null && (
          <div className="diagnosis" data-testid="diagnosis">
            {diagnosis.status === "loading" && (
              <p data-testid="diagnosis-loading">正在定位疑似抄错…</p>
            )}
            {diagnosis.status === "error" && (
              <p
                className="diagnosis-error"
                data-testid="diagnosis-error"
                role="alert"
              >
                {diagnosis.message}
              </p>
            )}
            {diagnosis.status === "ready" &&
              diagnosis.result.candidates.length === 0 && (
                <p data-testid="no-candidates">
                  成本预算内未找到可使实填校验位成立的候选，请重新核对箱号。
                </p>
              )}
            {diagnosis.status === "ready" &&
              diagnosis.result.candidates.length > 0 && (
                <div data-testid="candidates">
                  <p className="candidates-head">
                    最低改动成本：
                    {diagnosis.result.minimum_cost}
                    ，点选候选回填四段后重新提交：
                  </p>
                  <ul className="candidate-list">
                    {diagnosis.result.candidates.map((number) => (
                      <li key={number}>
                        <button
                          type="button"
                          className="candidate"
                          data-testid={`candidate-${number}`}
                          onClick={() => handlePickCandidate(number)}
                        >
                          {number}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
          </div>
        )}
      </section>
    </main>
  );
}
