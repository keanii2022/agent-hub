// The public check (H13): fails when a file git tracks holds something that
// must never be published: a secret, personal data, or a banned name.
//
// Run it with `npm run check:public`. It uses only Node itself, so a fresh
// copy can run it before anything else is installed.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Company, client and employer names can't be written into a tracked file
 * (that would publish them), so they live in this git-ignored list instead:
 * one name per line, blank lines and lines starting with # are skipped.
 */
export const BANNED_NAMES_FILE = "private/banned-names.txt";

export interface Finding {
  file: string;
  /** 0 when the finding is about the file's name or the whole file. */
  line: number;
  what: string;
}

/**
 * Things the check would flag that are fine on purpose. Every entry needs a
 * reason, so nothing is skipped silently.
 */
export interface Allowance {
  file: string;
  contains: string;
  reason: string;
}

export const ALLOWED: Allowance[] = [];

export interface PublicCheckResult {
  findings: Finding[];
  filesChecked: number;
  bannedListFound: boolean;
  bannedNamesCount: number;
  allowancesUsed: Allowance[];
  allowancesUnused: Allowance[];
}

interface Pattern {
  what: string;
  regex: RegExp;
  /** True when the match is a harmless placeholder rather than the real thing. */
  isPlaceholder?: (match: RegExpExecArray) => boolean;
}

const PLACEHOLDER_WORDS = /example|placeholder|changeme|change-me|your[-_ ]|dummy|sample|xxxx|\*\*\*|<|\$\{|process\.env/i;

const PLACEHOLDER_EMAIL_DOMAINS = /(^|\.)(example\.(com|org|net)|example|test|invalid|localhost)$/i;

const PLACEHOLDER_HOME_NAMES = new Set(["you", "me", "name", "username", "user", "yourname", "your-name", "example", "someone", "..."]);

const SECRET_PATTERNS: Pattern[] = [
  { what: "an AWS access key", regex: /\b(AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { what: "a GitHub token", regex: /\b(gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b/g },
  { what: "a Slack token", regex: /\bxox[abposr]-[A-Za-z0-9-]{10,}/g },
  { what: "an Anthropic or OpenAI style API key", regex: /\bsk-(ant-|proj-)?[A-Za-z0-9_-]{20,}/g },
  { what: "a Stripe live key", regex: /\b[sr]k_live_[A-Za-z0-9]{16,}/g },
  { what: "a Google API key", regex: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { what: "a web token (JWT)", regex: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g },
  { what: "a private key block", regex: /-----BEGIN ([A-Z0-9]+ )*PRIVATE KEY( BLOCK)?-----/g },
  {
    what: "a password, secret or token written into the file",
    regex: /\b(password|passwd|pwd|secret|client_secret|api[_-]?key|access[_-]?key|auth[_-]?token|access[_-]?token|token)\b["']?\s*[:=]\s*["'`]([^"'`\s]{8,})["'`]/gi,
    isPlaceholder: (match) => PLACEHOLDER_WORDS.test(match[2]),
  },
];

const PERSONAL_PATTERNS: Pattern[] = [
  {
    what: "an email address",
    regex: /\b[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,})\b/g,
    isPlaceholder: (match) => PLACEHOLDER_EMAIL_DOMAINS.test(match[1]),
  },
  {
    what: "a phone number",
    regex: /(\+\d{1,3}[ .-]\(?\d{1,4}\)?([ .-]\d{2,4}){2,4}\b|\(\d{3}\) ?\d{3}-\d{4}\b|\b\d{3}-\d{3}-\d{4}\b)/g,
  },
  {
    what: "a home-folder path",
    regex: /(\/(Users|home)\/|[A-Za-z]:\\Users\\)([A-Za-z0-9._-]+)[\/\\]/g,
    isPlaceholder: (match) => PLACEHOLDER_HOME_NAMES.has(match[3].toLowerCase()),
  },
];

const CONTENT_PATTERNS = [...SECRET_PATTERNS, ...PERSONAL_PATTERNS];

/** Lists the files git tracks under `root`. */
export function trackedFiles(root: string): string[] {
  const output = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" });
  return output.split("\0").filter((file) => file.length > 0);
}

/** Reads the banned-names list, or returns null when there is none. */
export function readBannedNames(root: string, listFile: string = BANNED_NAMES_FILE): string[] | null {
  const path = join(root, listFile);
  if (!existsSync(path)) return null;
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .map((name) => name.trim())
    .filter((name) => name.length > 0 && !name.startsWith("#"));
}

function escapeForRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function bannedNamePatterns(names: string[]): Pattern[] {
  return names.map((name, index) => ({
    // The name itself is not printed, so the check's output never repeats it.
    what: `a name from the banned list (entry ${index + 1})`,
    // "Some Name" also matches some-name, some_name and SomeName, as in file names.
    regex: new RegExp(
      `(?<![A-Za-z0-9])${name.split(/\s+/).map(escapeForRegex).join("[\\s_.-]*")}(?![A-Za-z0-9])`,
      "gi",
    ),
  }));
}

function looksBinary(content: Buffer): boolean {
  return content.subarray(0, 8000).includes(0);
}

/** Shows enough of a match to find it, without printing a whole secret. */
function shortened(text: string, isSecret: boolean): string {
  const oneLine = text.replace(/\s+/g, " ");
  if (!isSecret) return oneLine.length > 60 ? `${oneLine.slice(0, 57)}...` : oneLine;
  return `${oneLine.slice(0, 6)}...`;
}

function isEnvFile(file: string): boolean {
  const name = basename(file);
  return name === ".env" || (name.startsWith(".env.") && name !== ".env.example");
}

function findAllIn(
  text: string,
  patterns: Pattern[],
  report: (what: string, matched: string) => void,
): void {
  for (const pattern of patterns) {
    pattern.regex.lastIndex = 0;
    for (let match = pattern.regex.exec(text); match !== null; match = pattern.regex.exec(text)) {
      if (pattern.isPlaceholder?.(match)) continue;
      report(pattern.what, match[0]);
    }
  }
}

export function checkPublic(options: {
  root: string;
  files?: string[];
  bannedNamesFile?: string;
  allowed?: Allowance[];
}): PublicCheckResult {
  const { root } = options;
  const files = options.files ?? trackedFiles(root);
  const allowed = options.allowed ?? ALLOWED;
  const bannedNames = readBannedNames(root, options.bannedNamesFile);
  const bannedPatterns = bannedNamePatterns(bannedNames ?? []);
  const findings: Finding[] = [];
  const used = new Set<Allowance>();

  const add = (file: string, line: number, what: string, matched: string, lineText: string) => {
    const allowance = allowed.find((entry) => entry.file === file && lineText.includes(entry.contains));
    if (allowance) {
      used.add(allowance);
      return;
    }
    const isSecret = SECRET_PATTERNS.some((pattern) => pattern.what === what);
    const isBanned = bannedPatterns.some((pattern) => pattern.what === what);
    findings.push({ file, line, what: isBanned ? what : `${what}: "${shortened(matched, isSecret)}"` });
  };

  for (const file of files) {
    if (isEnvFile(file)) findings.push({ file, line: 0, what: "a .env file is tracked by git" });
    findAllIn(file, [...PERSONAL_PATTERNS, ...bannedPatterns], (what, matched) => add(file, 0, what, matched, file));

    const path = join(root, file);
    if (!existsSync(path)) continue;
    const content = readFileSync(path);
    if (looksBinary(content)) continue;

    const lines = content.toString("utf8").split(/\r?\n/);
    lines.forEach((lineText, index) => {
      const line = index + 1;
      findAllIn(lineText, [...CONTENT_PATTERNS, ...bannedPatterns], (what, matched) =>
        add(file, line, what, matched, lineText),
      );
      if (basename(file) === ".env.example") {
        const setting = /^\s*(export\s+)?[A-Za-z_][A-Za-z0-9_]*\s*=\s*(\S.*)$/.exec(lineText);
        if (setting && !setting[2].startsWith("#")) {
          add(file, line, "a value in .env.example (it should stay empty)", setting[2], lineText);
        }
      }
    });
  }

  return {
    findings,
    filesChecked: files.length,
    bannedListFound: bannedNames !== null,
    bannedNamesCount: bannedNames?.length ?? 0,
    allowancesUsed: allowed.filter((entry) => used.has(entry)),
    allowancesUnused: allowed.filter((entry) => !used.has(entry)),
  };
}

export function describeResult(result: PublicCheckResult): string {
  const lines: string[] = [];
  lines.push(`Checked ${result.filesChecked} tracked files.`);
  lines.push(
    result.bannedListFound
      ? `Banned names: read ${result.bannedNamesCount} from ${BANNED_NAMES_FILE}.`
      : `Banned names: no list found at ${BANNED_NAMES_FILE}, so company, client and employer names were not checked.`,
  );
  for (const entry of result.allowancesUsed) {
    lines.push(`Allowed on purpose in ${entry.file}: ${entry.reason}`);
  }
  for (const entry of result.allowancesUnused) {
    lines.push(`Note: an allowance for ${entry.file} matched nothing and can be removed.`);
  }
  if (result.findings.length === 0) {
    lines.push("Nothing secret or private found.");
  } else {
    lines.push(`Found ${result.findings.length} thing(s) that must not be published:`);
    for (const finding of result.findings) {
      const where = finding.line === 0 ? finding.file : `${finding.file}, line ${finding.line}`;
      lines.push(`  ${where}: ${finding.what}`);
    }
  }
  return lines.join("\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = checkPublic({ root: process.cwd() });
  console.log(describeResult(result));
  process.exit(result.findings.length === 0 ? 0 : 1);
}
