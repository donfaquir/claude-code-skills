export const meta = {
  name: 'design-review-round',
  description:
    'One round of multi-role design review: parallel review agents with schema-validated output, dedup, and adversarial verification of Critical/High findings',
  whenToUse:
    'Invoked by the design-review-board skill for each review round. Requires args {designDoc, contextBrief, roles, round, previousFindings?, changes?}. Returns structured findings — the calling session handles user gates, file I/O, and the outer convergence loop.',
  phases: [
    { title: 'Review', detail: 'one agent per selected role, all in parallel' },
    { title: 'Verify', detail: 'adversarial refuter per Critical/High finding' },
  ],
}

// ---- Args validation ------------------------------------------------------------
const designDoc = args && args.designDoc
const contextBrief = (args && args.contextBrief) || ''
const roles = args && args.roles
const round = (args && args.round) || 1
const previousFindings = (args && args.previousFindings) || []
const changes = (args && args.changes) || ''

if (!designDoc || !Array.isArray(roles) || roles.length === 0) {
  throw new Error(
    'review-round requires args: {designDoc: string, contextBrief: string, roles: string[], round: number, previousFindings?: [], changes?: string}'
  )
}

// ---- Schemas --------------------------------------------------------------------
const REVIEW_SCHEMA = {
  type: 'object',
  required: ['role', 'findings', 'summary'],
  properties: {
    role: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'severity', 'title', 'symptom', 'impact', 'recommendation', 'affected_component', 'design_section'],
        properties: {
          id: { type: 'string', description: 'Severity prefix + number: C-1, H-1, M-1, L-1' },
          severity: { type: 'string', enum: ['Critical', 'High', 'Medium', 'Low'] },
          title: { type: 'string', description: 'Chinese' },
          symptom: { type: 'string', description: 'Must reference a specific part of the design document. Chinese' },
          impact: { type: 'string', description: 'Chinese' },
          recommendation: { type: 'string', description: 'Chinese' },
          affected_component: { type: 'string', description: 'File, module, table, or endpoint. Use "design-level" if none specific. English' },
          design_section: { type: 'string', description: 'Which section of the design document. English' },
        },
      },
    },
    summary: {
      type: 'object',
      required: ['critical', 'high', 'medium', 'low'],
      properties: {
        critical: { type: 'number' },
        high: { type: 'number' },
        medium: { type: 'number' },
        low: { type: 'number' },
      },
    },
  },
}

const VERDICT_SCHEMA = {
  type: 'object',
  required: ['finding_id', 'verdict', 'reasoning'],
  properties: {
    finding_id: { type: 'string' },
    verdict: { type: 'string', enum: ['confirmed', 'downgraded', 'dismissed'] },
    reasoning: { type: 'string', description: 'Chinese' },
    adjusted_severity: {
      type: 'string',
      enum: ['Critical', 'High', 'Medium', 'Low'],
      description: 'Only when verdict is downgraded',
    },
  },
}

// ---- Role definitions -----------------------------------------------------------
const ROLE_PROMPTS = {
  Architect: `You are a senior software architect reviewing the following design proposal.

Focus areas:
1. Abstraction quality — are interface / class responsibilities clear? Any abstraction leaks?
2. Extensibility — reasonable extension points without over-engineering?
3. Module coupling — dependencies reasonable? Circular or unnecessary tight coupling?
4. Design-pattern choice — are chosen patterns appropriate? Simpler alternative?
5. Complexity — does overall complexity match the problem scope? Over-engineering?

You must review independently — do not assume other roles will cover issues you leave unmentioned.`,

  SRE: `You are an SRE / operations engineer reviewing the following design proposal.

Focus areas:
1. Data durability — can state survive a restart or crash? Reliance on volatile storage for critical data?
2. Multi-instance consistency — state consistent across instances? Split-brain risk?
3. Failover — degradation plan when dependencies (DB / cache / MQ) fail?
4. Observability — logging / metrics / alerting for critical operations?
5. Deployment safety — canary rollout possible? Rollback safe? Data migration needed?
6. Capacity — memory, DB growth, QPS estimates reasonable?

Pay special attention to: any design that ties critical state to process lifetime.
You must review independently.`,

  Security: `You are a security engineer reviewing the following design proposal.

Focus areas:
1. Authentication & authorization — proper auth on endpoints? Privilege escalation risk?
2. Input validation — external input validated? Injection surfaces (SQL / command / expression)?
3. Data protection — sensitive data encrypted at rest / in transit? Log leakage?
4. OWASP Top 10 — check each category for applicability
5. Dependency security — new dependencies with known vulnerabilities?
6. Least privilege — services / components follow least-privilege?

You must review independently.`,

  DBA: `You are a DBA reviewing the following design proposal.

Focus areas:
1. Data model — table structure sound? Field types / lengths appropriate? Redundant fields?
2. Index design — query patterns covered by indexes? Redundant or missing indexes?
3. Query performance — critical SQL triggering full-table scans? Batching for large tables?
4. Transaction boundaries — scopes minimized? Long-transaction / lock-contention risk?
5. Data migration — DDL online-safe? Backfill needed? Strategy safe?
6. Data consistency — race conditions on concurrent writes? Unique constraints correct?

You must review independently.`,

  QA: `You are a QA engineer reviewing the following design proposal.

Focus areas:
1. Testability — critical paths coverable by automated tests? Hard-to-mock dependencies?
2. Boundary conditions — nulls, large data, concurrency, timeouts handled?
3. Fault injection — behavior under dependency failure defined? Verifiable?
4. Regression risk — which existing code modified? Impact scope clear?
5. Verification strategy — how to verify correctness post-launch?
6. Test-data construction — preparation difficult? Special environment needed?

You must review independently.`,

  Product: `You are a product manager reviewing the following design proposal.

Focus areas:
1. Problem fit — does the proposal solve the actual business problem, not just a technical one?
2. User impact — change transparent to existing users? User-side coordination needed?
3. Backward compatibility — existing flows / data affected? Business disruption during migration?
4. Delivery cadence — can it be delivered in phases? What is the MVP?
5. Cost-benefit — implementation complexity matches business value? Simpler 80% alternative?

You must review independently.`,
}

const OUTPUT_INSTRUCTION = `Return your review following the schema provided. Rules:
- "id" prefix: C- for Critical, H- for High, M- for Medium, L- for Low, followed by a number.
- "severity": exactly one of "Critical", "High", "Medium", "Low".
- "symptom": MUST reference a specific part of the design. No generic statements.
- "affected_component": file, module, table, or endpoint. Use "design-level" if none specific.
- title, symptom, impact, recommendation in Chinese. id, severity, affected_component, design_section in English.
- If no issues at a given severity, omit them from the findings array.`

// ---- Phase: Review — one agent per selected role --------------------------------
phase('Review')

let roundContext = ''
if (round > 1 && (previousFindings.length > 0 || changes)) {
  roundContext = `\n\n## Previous round context\n\n### Changes made since Round ${round - 1}\n${changes || '(none)'}\n\n### Your task this round\n1. Verify whether previous findings have been resolved\n2. Check whether the revisions introduced NEW issues in your domain\n3. Review the full updated design — not just the changed parts\n`
}

log(`Round ${round}: launching ${roles.length} review agents`)

const reviews = await parallel(
  roles.map(role => () => {
    const rolePrompt = ROLE_PROMPTS[role]
    if (!rolePrompt) {
      log(`Unknown role "${role}" — skipping`)
      return null
    }

    const rolePrev = previousFindings.filter(f => f._sourceRole === role)
    const prevBlock = round > 1
      ? `\n\n### Your previous findings (Round ${round - 1})\n${rolePrev.length > 0 ? rolePrev.map(f => `- [${f.id}] ${f.title}`).join('\n') : 'You did not review in the previous round'}\n`
      : ''

    const prompt = [
      rolePrompt,
      '\n\n## Codebase Context\n' + (contextBrief || '(No codebase context available — review based on document text only)'),
      prevBlock + roundContext,
      '\n\n## Design Document\n' + designDoc,
      '\n\n' + OUTPUT_INSTRUCTION,
    ].join('')

    return agent(prompt, {
      label: `review:${role}`,
      phase: 'Review',
      schema: REVIEW_SCHEMA,
    })
  })
)

// ---- Failure handling -----------------------------------------------------------
const validReviews = reviews.filter(Boolean)
const failedCount = reviews.length - validReviews.length
const failedRoles = roles.filter((_, i) => !reviews[i])

if (failedCount > reviews.length / 2) {
  log(`Review aborted: ${failedCount} of ${reviews.length} agents failed`)
  return {
    error: true,
    errorMessage: `Review aborted: ${failedCount} of ${reviews.length} agents failed (${failedRoles.join(', ')}). Please retry.`,
    round,
    findings: [],
    dismissed: [],
    failedRoles,
    stats: { critical: 0, high: 0, medium: 0, low: 0 },
  }
}
if (failedCount > 0) {
  log(`${failedCount} agent(s) failed: ${failedRoles.join(', ')} — findings may have gaps`)
}

// ---- Dedup — deterministic JS, not LLM judgment --------------------------------
const allFindings = validReviews.flatMap(r =>
  (r.findings || []).map(f => ({
    ...f,
    _sourceRole: r.role,
    _sourceRoles: [r.role],
  }))
)

const dedupMap = new Map()
for (const f of allFindings) {
  const key = `${(f.affected_component || '').toLowerCase()}::${f.severity}`
  if (dedupMap.has(key)) {
    const existing = dedupMap.get(key)
    existing._sourceRoles = [...new Set([...existing._sourceRoles, f._sourceRole])]
    if ((f.recommendation || '').length > (existing.recommendation || '').length) {
      existing._altRecommendation = existing.recommendation
      existing.recommendation = f.recommendation
    }
  } else {
    dedupMap.set(key, { ...f })
  }
}
const deduped = [...dedupMap.values()]
log(`${allFindings.length} raw findings → ${deduped.length} after dedup`)

// ---- Phase: Verify — adversarial refutation of Critical/High --------------------
const SEV_RANK = { Critical: 0, High: 1, Medium: 2, Low: 3 }
const critHigh = deduped.filter(f => SEV_RANK[f.severity] <= 1)

if (critHigh.length === 0) {
  log('No Critical/High findings — skipping adversarial verification')
}

const verdicts = critHigh.length > 0
  ? (phase('Verify'),
     log(`Verifying ${critHigh.length} Critical/High findings`),
     await parallel(
       critHigh.map(f => () =>
         agent(
           `You are a senior engineer tasked with CHALLENGING a review finding.
Your job is to determine if this finding is valid or a false positive.

## The Finding
- ID: ${f.id}
- Severity: ${f.severity}
- Title: ${f.title}
- Symptom: ${f.symptom}
- Impact: ${f.impact}
- Recommendation: ${f.recommendation}

## Source Role(s)
${f._sourceRoles.join(', ')}

## Design Document
${designDoc}

## Codebase Context
${contextBrief || '(none)'}

Evaluate:
1. Is the symptom actually present in the design? Quote the specific part.
2. Is the impact realistic given the tech stack and deployment context?
3. Does the design already address this concern elsewhere that the reviewer missed?
4. Is the severity level appropriate, or should it be lower?

Default to "confirmed" unless you have strong evidence to downgrade or dismiss.
Return reasoning in Chinese.`,
           {
             label: `verify:${f.id}`,
             phase: 'Verify',
             schema: VERDICT_SCHEMA,
           }
         ).then(v => ({ finding: f, verdict: v }))
       )
     ))
  : []

// ---- Apply verdicts -------------------------------------------------------------
const dismissed = []
const verifiedFindings = [...deduped]

for (const item of verdicts.filter(Boolean)) {
  const { finding, verdict } = item
  if (!verdict) continue
  const idx = verifiedFindings.findIndex(f => f.id === finding.id)
  if (idx === -1) continue

  if (verdict.verdict === 'dismissed') {
    dismissed.push({
      ...verifiedFindings[idx],
      _dismissReason: verdict.reasoning,
    })
    verifiedFindings.splice(idx, 1)
  } else if (verdict.verdict === 'downgraded' && verdict.adjusted_severity) {
    verifiedFindings[idx] = {
      ...verifiedFindings[idx],
      severity: verdict.adjusted_severity,
      _originalSeverity: finding.severity,
      _downgradeReason: verdict.reasoning,
    }
  }
}

// ---- Return ---------------------------------------------------------------------
const stats = { critical: 0, high: 0, medium: 0, low: 0 }
for (const f of verifiedFindings) {
  const key = f.severity.toLowerCase()
  if (key in stats) stats[key]++
}

verifiedFindings.sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity])

log(`Round ${round} complete: ${stats.critical}C ${stats.high}H ${stats.medium}M ${stats.low}L — ${dismissed.length} dismissed`)

return {
  error: false,
  round,
  findings: verifiedFindings,
  dismissed,
  failedRoles,
  stats,
}
