import type { CSSProperties } from 'react';
import { benchmarkCopy } from './benchmark-content';
import type { SiteLanguage } from './site-i18n';
import './benchmark.css';

/** Pass rates on Terminal-Bench 2.1, drawn as bars on a 0–100% scale with the leaderboard's error margin. */
export function BenchmarkSection({ language, methodUrl }: { language: SiteLanguage; methodUrl: string }) {
  const copy = benchmarkCopy[language];
  return (
    <section className="benchmark-section section-shell" id="benchmark" aria-labelledby="benchmark-title">
      <div className="benchmark-copy">
        <p className="section-kicker">{copy.kicker}</p>
        <h2 id="benchmark-title">{copy.title}</h2>
        <p className="benchmark-description">{copy.description}</p>
        <ul>
          {copy.points.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
        <a className="text-link" href={methodUrl} target="_blank" rel="noopener noreferrer">
          {copy.link}
          <span aria-hidden="true">↗</span>
        </a>
      </div>
      <figure className="benchmark-chart">
        <figcaption>{copy.scale}</figcaption>
        <ol>
          {copy.rows.map((row, index) => (
            <li
              key={row.label}
              className={index === 0 ? 'is-ours' : undefined}
              style={
                {
                  '--value': row.value + '%',
                  '--low': row.value - (row.margin || 0) + '%',
                  '--span': (row.margin || 0) * 2 + '%',
                } as CSSProperties
              }
            >
              <div className="benchmark-row-head">
                <span>{row.label}</span>
                <strong>
                  {row.value.toFixed(1)}%{row.margin ? <small> ±{row.margin}</small> : null}
                </strong>
              </div>
              <div className="benchmark-track" aria-hidden="true">
                <span className="benchmark-fill" />
                {row.margin ? <span className="benchmark-margin" /> : null}
              </div>
              <p>{row.note}</p>
            </li>
          ))}
        </ol>
        <div className="benchmark-axis" aria-hidden="true">
          {[0, 25, 50, 75, 100].map((tick) => (
            <span key={tick}>{tick}%</span>
          ))}
        </div>
      </figure>
    </section>
  );
}
