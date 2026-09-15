import { describe, expect, it } from "vitest";
import {
  LETTER_VALUES,
  characterValue,
  expectedCheckDigit,
  validateFields,
} from "./validation";

describe("character mapping", () => {
  it("maps digits to themselves", () => {
    for (let digit = 0; digit <= 9; digit += 1) {
      expect(characterValue(String(digit))).toBe(digit);
    }
  });

  it("maps letters starting at 10", () => {
    expect(LETTER_VALUES.A).toBe(10);
    expect(characterValue("A")).toBe(10);
  });

  it("skips 11 so B is 12", () => {
    expect(LETTER_VALUES.B).toBe(12);
  });

  it("skips 22 so K is 21 and L is 23", () => {
    expect(LETTER_VALUES.K).toBe(21);
    expect(LETTER_VALUES.L).toBe(23);
  });

  it("skips 33 so U is 32 and V is 34", () => {
    expect(LETTER_VALUES.U).toBe(32);
    expect(LETTER_VALUES.V).toBe(34);
  });

  it("maps the final letter Z to 38", () => {
    expect(LETTER_VALUES.Z).toBe(38);
  });

  it("never assigns a multiple of 11", () => {
    const values = Object.values(LETTER_VALUES);
    expect(values).toHaveLength(26);
    for (const value of values) {
      expect(value % 11).not.toBe(0);
    }
  });

  it("throws on lowercase letters", () => {
    expect(() => characterValue("a")).toThrow();
  });
});

describe("check-digit calculation boundaries", () => {
  it("matches the real-world vector CSQU305438 -> 3", () => {
    expect(expectedCheckDigit("CSQ", "U", "305438")).toBe("3");
  });

  it("records remainder 10 as 0 (CSQU000007 -> 0)", () => {
    expect(expectedCheckDigit("CSQ", "U", "000007")).toBe("0");
  });

  it("weights characters by powers of two from the left", () => {
    // AAAU000000: A=10, U=32 => 10 + 20 + 40 + 256 = 326; 326 % 11 = 7.
    expect(expectedCheckDigit("AAA", "U", "000000")).toBe("7");
  });

  it("handles the all-maximum case ZZZZ 999999 -> 6", () => {
    expect(expectedCheckDigit("ZZZ", "Z", "999999")).toBe("6");
  });

  it("supports J and Z categories just like U", () => {
    expect(expectedCheckDigit("CSQ", "J", "305438")).not.toBe(
      expectedCheckDigit("CSQ", "Z", "305438"),
    );
  });
});

describe("field validation", () => {
  const valid = {
    ownerCode: "CSQ",
    category: "U",
    serial: "305438",
    checkDigit: "3",
  };

  it("accepts a fully valid set of fields", () => {
    expect(validateFields(valid)).toEqual({});
  });

  it.each([
    { ownerCode: "CS1" },
    { ownerCode: "csq" },
    { ownerCode: "CS" },
    { ownerCode: "CSQQ" },
    { category: "X" },
    { category: "u" },
    { category: "" },
    { serial: "30543" },
    { serial: "3054388" },
    { serial: "30543A" },
    { checkDigit: "33" },
    { checkDigit: "A" },
    { checkDigit: "" },
  ] as const)("rejects invalid partial: %s", (override) => {
    const errors = validateFields({ ...valid, ...override });
    expect(Object.keys(errors)).toHaveLength(1);
    expect(Object.keys(override)[0] in errors).toBe(true);
  });
});
