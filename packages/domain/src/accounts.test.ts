import { describe, expect, it } from "vitest";

import { passwordChecks, passwordProblem, registerFormInput, registerInput, signInInput } from "./accounts";

const strong = "Analytical-Engine-1843";
const valid = { firstName: " Ada ", lastName: "Lovelace", email: " Ada@Example.COM ", password: strong, acceptTerms: true };

describe("passwords", () => {
  it("need 10 characters, an uppercase and a lowercase letter, a number and a special character", () => {
    expect(passwordProblem("Sh0rt!")).toMatch(/at least 10 characters/);
    expect(passwordProblem("analytical-engine-1")).toMatch(/an uppercase letter/);
    expect(passwordProblem("ANALYTICAL-ENGINE-1")).toMatch(/a lowercase letter/);
    expect(passwordProblem("Analytical-Engine")).toMatch(/a number/);
    expect(passwordProblem("AnalyticalEngine1")).toMatch(/a special character/);
    expect(passwordProblem(strong)).toBeNull();
  });

  it("ask for a password when there is none", () => {
    expect(passwordProblem("")).toBe("Enter a password.");
  });

  it("list every unmet rule at once", () => {
    expect(passwordProblem("abc")).toBe("Your password needs: at least 10 characters, an uppercase letter, a number, a special character, like ! ? # or @.");
  });

  it("refuse more than 128 characters, and the email name inside the password", () => {
    expect(passwordProblem(`Aa1!${"x".repeat(125)}`)).toMatch(/at most 128/);
    expect(passwordProblem("MyAda-Password-1", "ada@example.com")).toMatch(/email address/);
    expect(passwordProblem("MyAda-Password-1", "al@example.com")).toBeNull();
  });

  it("count letters beyond ASCII", () => {
    expect(passwordProblem("Überprüfung-2026")).toBeNull();
  });

  it("report each rule for the live checklist", () => {
    expect(passwordChecks("abcdefghij").map((c) => [c.id, c.met])).toEqual([
      ["length", true],
      ["upper", false],
      ["lower", true],
      ["number", false],
      ["special", false],
    ]);
  });
});

describe("register input", () => {
  it("trims names, normalises the email and drops an empty company", () => {
    const parsed = registerInput.parse({ ...valid, companyName: "  " });
    expect(parsed).toMatchObject({ firstName: "Ada", email: "ada@example.com" });
    expect(parsed.companyName).toBeUndefined();
  });

  it("accepts any email domain (B2C)", () => {
    expect(registerInput.safeParse({ ...valid, email: "someone@gmail.com" }).success).toBe(true);
  });

  it("refuses a weak password, a bad email, a missing name or unaccepted terms", () => {
    for (const bad of [{ password: "Weak-1" }, { email: "not-an-email" }, { firstName: "" }, { acceptTerms: false }]) {
      expect(registerInput.safeParse({ ...valid, ...bad }).success, JSON.stringify(bad)).toBe(false);
    }
  });

  it("puts the password problem on the password field", () => {
    const result = registerInput.safeParse({ ...valid, password: "weak" });
    expect(result.success ? [] : result.error.issues.map((i) => i.path.join("."))).toEqual(["password"]);
  });
});

describe("register form", () => {
  it("needs the confirmation to match", () => {
    expect(registerFormInput.safeParse({ ...valid, confirmPassword: strong }).success).toBe(true);
    const result = registerFormInput.safeParse({ ...valid, confirmPassword: `${strong}x` });
    expect(result.success ? [] : result.error.issues.map((i) => [i.path.join("."), i.message])).toEqual([["confirmPassword", "The passwords don't match."]]);
  });
});

describe("sign-in input", () => {
  it("needs an email and a password, and doesn't apply the password rules", () => {
    expect(signInInput.safeParse({ email: "ada@example.com", password: "old" }).success).toBe(true);
    expect(signInInput.safeParse({ email: "ada@example.com", password: "" }).success).toBe(false);
  });
});
