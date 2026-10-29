import { describe, expect, it } from "vitest";

import { verificationEmail } from "../modules/accounts/emails";
import { LOGO_CID } from "./layout";

const link = "http://localhost:3000/verify-email?token=abc.def";

describe("the branded email layout", () => {
  it("puts the link in the button and in the copy-paste fallback, and in the text version", () => {
    const email = verificationEmail("ada@example.com", "Ada", link, 60);
    expect(email.html.match(/href="http:\/\/localhost:3000\/verify-email\?token=abc\.def"/g)).toHaveLength(2);
    expect(email.text).toContain(`Verify my email: ${link}`);
    expect(email.text).toContain("Hi Ada,");
    expect(email.text).toContain("expires in 60 minutes");
  });

  it("escapes everything the person typed", () => {
    const email = verificationEmail("x@example.com", `<img src=x onerror="alert(1)">`, link, 60);
    expect(email.html).not.toContain("<img src=x");
    expect(email.html).toContain("&#60;img src=x");
  });

  it("greets someone without a first name", () => {
    expect(verificationEmail("x@example.com", null, link, 60).text).toContain("Hi there,");
  });

  it("attaches the logo inline and shows it by cid, never as SVG or a data: URL", () => {
    const email = verificationEmail("ada@example.com", "Ada", link, 60);
    expect(email.html).toContain(`src="cid:${LOGO_CID}"`);
    expect(email.html).not.toMatch(/<svg|data:image/);
    const [logo] = email.images ?? [];
    expect(logo).toMatchObject({ cid: LOGO_CID, contentType: "image/png" });
    // A real PNG: the signature bytes.
    expect(logo!.content.subarray(0, 4).toString("hex")).toBe("89504e47");
  });

  it("sets the inbox preview line and stays light in dark-mode clients", () => {
    const html = verificationEmail("ada@example.com", "Ada", link, 60).html;
    expect(html).toContain("One click to confirm your email");
    expect(html).toContain('<meta name="color-scheme" content="light">');
  });
});
