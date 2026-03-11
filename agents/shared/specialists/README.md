# Specialist Agent Definitions

These are the 13 specialist agent personas shared across the LMNTL ecosystem.
They originate from the `claude-code-best-practices` repo and provide deep
domain expertise that Kit, Trak, and Scout can adopt during ensemble audits
and other complex tasks.

## How Human-Facing Agents Use Specialists

Kit, Trak, and Scout are **persistent, Slack-native agents** that interact
directly with humans. The specialist agents are **expertise profiles** — not
separate processes — that the human-facing agents can adopt when a task
requires deep domain knowledge.

### Primary Mapping

| Human-Facing Agent | Primary Specialists | When |
|--------------------|--------------------|----|
| **Kit** (Engineering) | code-review-architect, security-risk-auditor, technical-architect, devops-engineer, site-reliability-engineer, qa-test-engineer, implementation-engineer, pr-scope-reviewer, data-engineer | PR reviews, ensemble audits, architecture decisions |
| **Trak** (Project Mgmt) | product-owner, business-analyst, orchestrator-coordinator | Sprint planning, requirements, prioritization, coordination |
| **Scout** (Customer) | ux-ui-designer | Customer impact assessment, accessibility review |

### During Ensemble Audits

All agents have access to ALL specialist perspectives. Kit orchestrates
the 7-dimension audit and can invoke any specialist persona. Trak and Scout
contribute their domain-specific specialist knowledge to the ensemble result.

## Agent Files

| File | Audit Dimension | Focus |
|------|----------------|-------|
| `code-review-architect.md` | Correctness | Logic, edge cases, patterns |
| `security-risk-auditor.md` | Security | OWASP, auth, secrets, tenant isolation |
| `ux-ui-designer.md` | UX/Accessibility | WCAG 2.1 AA, usability |
| `product-owner.md` | Product-Market Fit | Strategy, value, scope |
| `devops-engineer.md` | Operations | CI/CD, deployment, infra |
| `site-reliability-engineer.md` | Operations | SLIs/SLOs, incidents, monitoring |
| `qa-test-engineer.md` | Test Coverage | Test pyramid, coverage, regressions |
| `technical-architect.md` | Architecture | Patterns, maintainability |
| `data-engineer.md` | (Cross-cutting) | Database, ETL, query optimization |
| `implementation-engineer.md` | (Cross-cutting) | Implementation standards, TDD |
| `pr-scope-reviewer.md` | (Pre-audit) | Atomic scope validation |
| `business-analyst.md` | (Cross-cutting) | Requirements, ROI, process mapping |
| `orchestrator-coordinator.md` | (Meta) | Multi-agent coordination patterns |

## Evidence Protocol (All Specialists)

Every finding must:
- Cite `file:line` with actual code quotes
- Label as `VERIFIED` (read actual code) or `UNVERIFIED` (inferred)
- Cross-reference middleware, framework defaults, and existing tests
- Distinguish pre-existing issues from new ones

Historical false positive rate: ~40-50%. Always verify against actual code.
