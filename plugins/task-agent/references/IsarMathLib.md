# IsarMathLib Style Guide

Based on the upstream CONTRIBUTING.md and the conventions observed in the existing theory files.

## Guiding principle

Readability above all. Any person familiar with standard mathematical notation should be able to follow the proofs without knowing Isabelle.

## 1. Always use declarative Isar style

No old-style verification scripts. Every proof must be written in structured Isar:

```isabelle
proof -
  have "..." using some_lemma by simp
  then have "..." by auto
  ...
  show ?thesis by blast
qed
```

The shorthand `proof ... qed` with `have`/`show`/`obtain`/`fix`/`assume` is the only accepted style. Inline tactic calls (`erule_tac`, `drule_tac`, `rule_tac` with explicit instantiation) are rejected.

## 2. Stay close to natural language

- Name definitions with full words: `Integers`, not `int`; `IsRegular`, not `reg`.
- Do not use keyword-like or non-word identifiers.
- The canonical proof pattern is:

  ```isabelle
  from <local facts> have <statement> using <theorems> by simp
  ```

- A few extra lines of readable proof are preferred over one line of unreadable tactic magic.

## 3. Comments with embedded LaTeX

Every theory file must have comments (`text\<open>...\<close>`) at:

- The start of the file (what it covers, what is proven)
- The start of every `subsection`
- Before every `definition`
- Before every `lemma` / `theorem` / `corollary`

Comments should contain LaTeX formulae using `$...$` for inline math. They do not need to be a formal proof — a brief English description is enough. Example:

```isabelle
text\<open>A set $U$ is regular open if $U = \mathrm{int}(\mathrm{cl}(U))$.
  Every open set in a regular space is regular open.\<close>
```

Avoid creating the impression that the comment is an "informal proof" — it should be a description, not a proof.

## 4. Use locales for notation

Group related definitions and lemmas under a locale that fixes the topology and introduces notation:

```isabelle
locale topology0 =
  fixes T
  assumes topSpaceAssum: "T {is a topology}"
```

This keeps notation consistent across the file and avoids repeating hypotheses in every lemma.

## 5. File structure

```
(* copyright header *)

section \<open>Short section title\<close>

theory Foo_ZF imports Bar_ZF Baz_ZF
begin

subsection\<open>Topic name\<close>

text\<open>What this subsection covers.\<close>

definition
  MyNotion ("_{is my-notion}" 70)
  where "T{is my-notion} \<equiv> ..."

text\<open>Brief description of the lemma.\<close>

lemma (in topology0) my_lemma:
  assumes "..."
  shows "..."
proof -
  ...
qed

end
```

- Use `section` once per file, at the top.
- Use `subsection` to group related material.
- `corollary` is used for results that follow directly from a preceding lemma with little additional proof.
- Prefer `lemma` for technical helper results and `theorem` for main results.

## 6. Notation priorities

Custom notation uses a priority number (e.g. `"_{is locally-regular}" 70`). Pick a priority that does not clash with existing operators. Priorities 60–90 are commonly used in IsarMathLib for set-theoretic and topological predicates.

## 7. What not to do

- Do not use HOL tactics or HOL-only methods (`ring`, `linarith`, `norm_num`) — this is Isabelle/ZF.
- Do not add a definition without a preceding `text` comment.
- Do not use abbreviations as names (`loc_reg` is acceptable for a helper lemma, but `IsLocReg` is not a good definition name — prefer `IsLocallyRegular`).
- Do not introduce `sorry` in submitted proofs.
- Do not use `ML` blocks or custom proof methods.
- Do not use `a` as a variable name in proofs — pick a name that reflects its meaning (e.g., `x`, `U`, `A`).
