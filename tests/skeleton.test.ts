import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const installed = Object.keys({
  ...packageJson.dependencies,
  ...packageJson.devDependencies,
});

const aiPackages = /^(openai|ai|langchain|ollama|cohere-ai|replicate)$|^@(anthropic-ai|openai|langchain|google\/generative-ai|ai-sdk|mistralai)\b/;
const gamePackages = /^(phaser|pixi\.js|kaboom|kaplay|excalibur|three|melonjs|matter-js|babylonjs)$|^@(pixi|babylonjs)\//;

describe("skeleton", () => {
  it("has one command that starts the hub", () => {
    expect(packageJson.scripts.hub).toBeTruthy();
  });

  it("installs no AI packages", () => {
    expect(installed.filter((name) => aiPackages.test(name))).toEqual([]);
  });

  it("installs no game packages", () => {
    expect(installed.filter((name) => gamePackages.test(name))).toEqual([]);
  });
});
