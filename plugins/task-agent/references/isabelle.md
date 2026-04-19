# Isabelle Reference

Isabelle is a generic proof assistant. The two main object logics in use are **Isabelle/HOL** (higher-order logic, most common) and **Isabelle/ZF** (Zermelo-Fraenkel set theory). They are incompatible — never mix tactics or libraries from one into the other.

## Build commands

```bash
# Build a heap image for a logic (e.g. HOL or ZF) — required before first use
isabelle build -b HOL
isabelle build -b ZF

# Check and build a project rooted at a directory
isabelle build -D ./MyProject

# Build a single named session
isabelle build MySession

# List available sessions
isabelle build -l

# isabelle binary must be on PATH (found in <isabelle-dist>/bin/)
```

## Theory files

- Extension: `.thy`
- Structure: `theory Name imports Dep1 Dep2 begin ... end`
- Isabelle resolves the import DAG automatically; circular imports are an error.
- `\<open>...\<close>` (typed as `\<open>` / `\<close>`) is the quasi-quotation delimiter used in `text`, notation strings, and term references.
- Unicode symbols (`\<forall>`, `\<exists>`, `\<Longrightarrow>`, `\<inter>`, etc.) are entered as backslash sequences in Isabelle/jEdit or VS Code with the Isabelle extension; they display as the actual symbols.

## Isar proof language

Isabelle proofs are written in **Isar** (Intelligible Semi-Automated Reasoning). Always prefer declarative Isar over old-style tactic scripts.

```isabelle
lemma my_lemma:
  assumes h: "P x"
  shows "Q x"
proof -
  have step1: "R x" using h by simp
  then have step2: "S x" by auto
  show ?thesis using step2 by blast
qed
```

Key proof commands:

| Command                              | Purpose                                                |
|--------------------------------------|--------------------------------------------------------|
| `fix x`                              | Introduce a universally quantified variable            |
| `assume h: "P"`                      | Assume a hypothesis, binding it to name `h`            |
| `have "P" by tac`                    | Prove an intermediate fact                             |
| `from h have "P" using lemma by tac` | Prove using named facts and lemmas                     |
| `obtain x where "P x" using ...`     | Existential elimination                                |
| `show ?thesis by tac`                | Close the current goal                                 |
| `thus ?thesis`                       | Shorthand for `then show ?thesis`                      |
| `moreover` / `ultimately`            | Chain multiple `have` steps into a combined conclusion |

## Proof tactics (closing steps)

| Tactic               | When to use                                               |
|----------------------|-----------------------------------------------------------|
| `by simp`            | Simplification; handles arithmetic, rewriting             |
| `by auto`            | simp + classical reasoning; tries harder than simp        |
| `by blast`           | Pure classical tableau; good for propositional goals      |
| `by force`           | auto + blast combination; last resort before manual steps |
| `by (rule foo)`      | Apply a specific rule                                     |
| `by (intro foo bar)` | Apply introduction rules                                  |

Avoid `apply`-style tactic scripts (sequences of `apply (tac)` without `have`/`show` structure) — they are hard to read and maintain.

## Locales

Locales are the standard mechanism for bundling assumptions and notation:

```isabelle
locale my_context =
  fixes A :: "'a set"
  assumes non_empty: "A \<noteq> {}"
begin

lemma foo: "..." proof ...

end

interpretation my_interpretation: my_context "some_set" proof ... qed
```

Use `(in locale_name)` to add lemmas to an existing locale without reopening it:

```isabelle
lemma (in my_context) bar: "..." proof ...
```

## Document generation

Isabelle can generate PDF proof documents from `text\<open>...\<close>` comments. LaTeX (including extras) must be installed:

```bash
apt-get install texlive-latex-extras   # Ubuntu/Debian
```

Document output goes to the session's output directory; `isabelle build` prints the path on completion.

## Sessions ROOT file

Large projects define sessions in a `ROOT` file:

```
session MySession in "src" = HOL +
  options [document = pdf]
  theories
    Foo
    Bar
  document_files
    "root.tex"
```

## Isabelle/ZF vs Isabelle/HOL

|                 | Isabelle/HOL                  | Isabelle/ZF                     |
|-----------------|-------------------------------|---------------------------------|
| Foundation      | Higher-order logic            | ZF set theory                   |
| Numbers         | `nat`, `int`, `real` as types | von Neumann ordinals as sets    |
| Sets            | `'a set` type                 | First-class ZF sets             |
| Powerset        | `Pow A` (type-level)          | `Pow(A)` (set-level)            |
| Comprehension   | `{x. P x}` (type-bounded)     | `{x\<in>A. P(x)}` (set-bounded) |
| Typical imports | `Main`, `Complex_Main`        | `ZF`, `ZF1`                     |

In Isabelle/ZF there is no `nat` type — natural numbers are ZF sets (von Neumann ordinals). HOL lemmas and tactics (`linarith`, `ring`, `norm_num`) do not work in ZF sessions.

ZF context: https://isabelle.in.tum.de/dist/library/FOL/ZF/