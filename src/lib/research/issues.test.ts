import { describe, expect, it } from "vitest";
import { exactFuzzyDate } from "../fuzzy-date";
import { buildResearchIndex } from "./graph";
import { buildResearchIssues } from "./issues";
import {
  parentRelationship,
  partnerRelationship,
  person,
  treeGraph,
} from "./test-helpers";

function indexOf(input: Parameters<typeof treeGraph>[0]) {
  return buildResearchIndex(treeGraph(input));
}

const birthplace = { birthPlace: "Boston, Massachusetts" };

describe("research issues", () => {
  it("flags a death before the birth", () => {
    const issues = buildResearchIssues(
      indexOf({
        people: [
          person("a", "Ada", "Lane", 1950, {
            deathDate: exactFuzzyDate(1940),
            ...birthplace,
          }),
        ],
      }),
    );
    expect(issues.map(issue => issue.id)).toContain("death-before-birth");
  });

  it("flags a parent recorded under twelve", () => {
    const issues = buildResearchIssues(
      indexOf({
        people: [
          person("parent", "Pat", "Lane", 1880, birthplace),
          person("child", "Kit", "Lane", 1890, birthplace),
        ],
        relationships: [parentRelationship("r1", "parent", "child")],
      }),
    );
    expect(issues.map(issue => issue.id)).toContain("parent-too-young");
  });

  it("flags a child born long after a parent died", () => {
    const issues = buildResearchIssues(
      indexOf({
        people: [
          person("parent", "Pat", "Lane", 1880, {
            deathDate: exactFuzzyDate(1950),
            ...birthplace,
          }),
          person("child", "Kit", "Lane", 1955, birthplace),
        ],
        relationships: [parentRelationship("r1", "parent", "child")],
      }),
    );
    expect(issues.map(issue => issue.id)).toContain("child-after-parent-death");
  });

  it("flags a partnership that ends before it starts", () => {
    const issues = buildResearchIssues(
      indexOf({
        people: [
          person("a", "Ada", "Lane", 1900, birthplace),
          person("b", "Ben", "Lane", 1902, birthplace),
        ],
        relationships: [
          partnerRelationship("p1", "a", "b", {
            startDate: exactFuzzyDate(1950),
            endDate: exactFuzzyDate(1940),
          }),
        ],
      }),
    );
    expect(issues.map(issue => issue.id)).toContain("partnership-end-before-start");
  });

  it("flags a child with more than two parents", () => {
    const issues = buildResearchIssues(
      indexOf({
        people: [
          person("a", "Ada", "Lane", 1900, birthplace),
          person("b", "Ben", "Lane", 1902, birthplace),
          person("c", "Cora", "Lane", 1904, birthplace),
          person("child", "Kit", "Lane", 1930, birthplace),
        ],
        relationships: [
          parentRelationship("r1", "a", "child"),
          parentRelationship("r2", "b", "child"),
          parentRelationship("r3", "c", "child", "step"),
        ],
      }),
    );
    expect(issues.map(issue => issue.id)).toContain("too-many-parents");
  });

  it("flags two people with the same name and a compatible birth year", () => {
    const issues = buildResearchIssues(
      indexOf({
        people: [
          person("a", "John", "Smith", 1900, birthplace),
          person("b", "John", "Smith", 1900, birthplace),
        ],
      }),
    );
    expect(issues.map(issue => issue.id)).toContain("possible-duplicates");
  });

  it("returns no warnings for a plausible family", () => {
    const issues = buildResearchIssues(
      indexOf({
        people: [
          person("parent", "Pat", "Lane", 1900, birthplace),
          person("child", "Kit", "Lane", 1930, birthplace),
        ],
        relationships: [parentRelationship("r1", "parent", "child")],
      }),
    );
    expect(issues.filter(issue => issue.severity === "warning")).toEqual([]);
  });
});
