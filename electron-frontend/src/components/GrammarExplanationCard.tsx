import type { GrammarExplanation } from '../lib/grammarExplanations'

interface GrammarExplanationCardProps {
  explanation: GrammarExplanation
}

/**
 * Inline grammar breakdown shown inside the round feedback panel after a wrong answer on a
 * grammar card (issue #25): pattern name, how it is formed, two model sentences, and the
 * mistake learners actually make.
 */
export function GrammarExplanationCard({ explanation }: GrammarExplanationCardProps) {
  return (
    <section className="round-feedback-grammar" aria-label={`Grammar explanation: ${explanation.name}`}>
      <span className="round-feedback-detail-label">Grammar</span>
      <p className="round-feedback-grammar-name">{explanation.name}</p>
      <p className="round-feedback-grammar-formation">{explanation.formation}</p>
      <ul className="round-feedback-grammar-examples">
        {explanation.examples.map((example) => (
          <li key={example.jp} className="round-feedback-grammar-example">
            <span className="round-feedback-example-jp">{example.jp}</span>
            <span className="round-feedback-example-romaji">{example.romaji}</span>
            <span className="round-feedback-example-en">{example.en}</span>
          </li>
        ))}
      </ul>
      <p className="round-feedback-grammar-mistake">
        <span className="round-feedback-grammar-mistake-label">Watch out</span>
        {explanation.commonMistake}
      </p>
    </section>
  )
}
