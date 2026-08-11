# Learn AI — agent working rules

`LEARN_AI_V1_BUILD_SPEC.md` is the authoritative build specification. Before
writing any code:

1. Read the spec, then **state which task number (T01–T21) you are executing**.
2. Execute tasks strictly in §12 order; do not start a task until the previous
   task's acceptance criteria all pass.
3. Every task ends with tests written and passing, `README` updated, and a
   commit whose message carries the task number, e.g. `feat(T07): RSS
   ingestion service`.
4. If a requirement is ambiguous or looks wrong, **stop and ask** — especially
   anything touching §3 (schema) or §5 (review gate).
5. Anything marked **NON-NEGOTIABLE** in the spec must not be altered,
   deferred, or stubbed without explicit founder approval.

Deferred decisions (§2) are resolved: the recommended defaults are accepted —
Next.js App Router on AWS Amplify Hosting, Auth.js with a Postgres adapter,
Amazon Bedrock (`LLM_PROVIDER=bedrock`) with `AnthropicLlmClient` as the
swappable alternative.

Repo history note: this folder previously held a different product (Acadu).
That codebase is archived at https://github.com/xempie/learnai (branches
`master`, `services-funnel`) and its production deployment at
learnai.data-corner.com.au remains live and untouched. `.env.acadu-legacy.local`
holds the legacy environment secrets — gitignored, do not commit, do not
delete.
