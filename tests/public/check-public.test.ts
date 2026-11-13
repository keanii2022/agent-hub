import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BANNED_NAMES_FILE, checkPublic, describeResult } from "../../scripts/check-public";

// Every fake secret is glued together at run time, so this file never holds
// anything secret-shaped and the public check passes on it.
const piece = (...parts: string[]) => parts.join("");
const FAKE_AWS_KEY = piece("AK", "IA", "ABCDEFGHIJKLMNOP");
const FAKE_API_KEY = piece("sk", "-ant-", "abcdefghij0123456789abcdefghij");
const FAKE_GITHUB_TOKEN = piece("gh", "p_", "a".repeat(36));
const FAKE_KEY_BLOCK = piece("-----BEGIN ", "RSA PRIVATE ", "KEY-----");
const FAKE_PASSWORD_LINE = piece("pass", "word", ' = "hunter2hunter2"');
const FAKE_EMAIL = piece("jo.bloggs", "@", "mailbox-fake.com");
const FAKE_PHONE = piece("+44 ", "20 7946 ", "0018");
const FAKE_HOME_PATH = piece("/Us", "ers/", "jbloggs/Projects/thing");
const FAKE_BANNED_NAME = "Fakecorp Holdings";

const ROOT = resolve("test-results/check-public");

function plant(file: string, content: string | Buffer): void {
  const path = join(ROOT, file);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function trackEverything(): void {
  execFileSync("git", ["init", "-q"], { cwd: ROOT });
  execFileSync("git", ["add", "-A"], { cwd: ROOT });
}

function whatWasFound(files?: string[]): string[] {
  return checkPublic({ root: ROOT, files, allowed: [] }).findings.map(
    (finding) => `${finding.file}:${finding.line} ${finding.what}`,
  );
}

describe("H13: the public check", () => {
  beforeEach(() => {
    rmSync(ROOT, { recursive: true, force: true });
    mkdirSync(ROOT, { recursive: true });
  });

  afterEach(() => {
    rmSync(ROOT, { recursive: true, force: true });
  });

  it("H13: catches planted fake secrets in tracked files", () => {
    plant("config.ts", [`const aws = "${FAKE_AWS_KEY}";`, `const ai = "${FAKE_API_KEY}";`, `const gh = "${FAKE_GITHUB_TOKEN}";`, FAKE_PASSWORD_LINE].join("\n"));
    plant("keys/server.pem", `${FAKE_KEY_BLOCK}\nabc\n`);
    trackEverything();

    const found = whatWasFound();

    expect(found).toContainEqual(expect.stringMatching(/^config\.ts:1 an AWS access key/));
    expect(found).toContainEqual(expect.stringMatching(/^config\.ts:2 an Anthropic or OpenAI style API key/));
    expect(found).toContainEqual(expect.stringMatching(/^config\.ts:3 a GitHub token/));
    expect(found).toContainEqual(expect.stringMatching(/^config\.ts:4 a password, secret or token written into the file/));
    expect(found).toContainEqual(expect.stringMatching(/^keys\/server\.pem:1 a private key block/));
    // The output never prints a whole secret.
    expect(found.join("\n")).not.toContain(FAKE_API_KEY);
  });

  it("H13: catches a fake email, phone number and home-folder path", () => {
    plant("notes.md", [`Write to ${FAKE_EMAIL}`, `Call ${FAKE_PHONE}`, `Saved in ${FAKE_HOME_PATH}`].join("\n"));
    trackEverything();

    const found = whatWasFound();

    expect(found).toContainEqual(expect.stringMatching(/^notes\.md:1 an email address/));
    expect(found).toContainEqual(expect.stringMatching(/^notes\.md:2 a phone number/));
    expect(found).toContainEqual(expect.stringMatching(/^notes\.md:3 a home-folder path/));
  });

  it("H13: catches a banned name from the private list, in text and in a binary file's name, without printing it", () => {
    plant(BANNED_NAMES_FILE, `# names that must never be published\n\n${FAKE_BANNED_NAME}\n`);
    plant("README.md", `Built for ${FAKE_BANNED_NAME.toUpperCase()} last year.`);
    plant(`docs/${FAKE_BANNED_NAME.replace(" ", "-")}.png`, Buffer.from([0x89, 0x50, 0x00, 0x00, ...Buffer.from(FAKE_AWS_KEY)]));
    const files = ["README.md", `docs/${FAKE_BANNED_NAME.replace(" ", "-")}.png`];

    const result = checkPublic({ root: ROOT, files, allowed: [] });
    const found = result.findings.map((finding) => `${finding.file}:${finding.line} ${finding.what}`);

    expect(result.bannedListFound).toBe(true);
    expect(result.bannedNamesCount).toBe(1);
    expect(found).toContainEqual("README.md:1 a name from the banned list (entry 1)");
    // The binary file is checked by name only: the key inside it is not read.
    expect(found).toEqual([
      "README.md:1 a name from the banned list (entry 1)",
      `docs/${FAKE_BANNED_NAME.replace(" ", "-")}.png:0 a name from the banned list (entry 1)`,
    ]);
    // Only a file's own name can repeat a banned name; what was found never does.
    expect(result.findings.map((finding) => finding.what).join("\n")).not.toMatch(/fakecorp/i);
  });

  it("H13: says plainly when there is no banned-names list, and still runs", () => {
    plant("README.md", "Nothing to see.");
    trackEverything();

    const result = checkPublic({ root: ROOT, allowed: [] });

    expect(result.bannedListFound).toBe(false);
    expect(result.findings).toEqual([]);
    expect(describeResult(result)).toContain("no list found at private/banned-names.txt");
  });

  it("H13: flags a tracked .env file by its name", () => {
    expect(whatWasFound([".env"])).toEqual([".env:0 a .env file is tracked by git"]);
    expect(whatWasFound(["config/.env.production"])).toEqual(["config/.env.production:0 a .env file is tracked by git"]);
  });

  it("H13: lets obvious placeholders through", () => {
    plant(
      "README.md",
      [
        "Mail someone@example.com",
        "Point it at /path/to/your/plans or /Users/you/projects/",
        'password = "your-password-here"',
        "Built at 2026-10-05T14:07:30Z, step 12 of 18.",
      ].join("\n"),
    );
    trackEverything();

    expect(whatWasFound()).toEqual([]);
  });

  it("H13: an allow-list entry silences a finding, and the output names its reason", () => {
    plant("notes.md", `Write to ${FAKE_EMAIL}`);
    trackEverything();
    const allowed = [{ file: "notes.md", contains: FAKE_EMAIL, reason: "a made-up address the tests need" }];

    const result = checkPublic({ root: ROOT, allowed });

    expect(result.findings).toEqual([]);
    expect(describeResult(result)).toContain("Allowed on purpose in notes.md: a made-up address the tests need");
  });
});
