import { useRef, useState } from 'react';
import { ATTRIBUTES, ATTRIBUTE_INFO, CAMPAIGN_COMPLETE_BONUS_XP, CHAPTER_XP, LIMITS, type Attribute } from '../../engine/constants';
import type { Campaign, GameState } from '../../engine/types';
import { useCelebration } from '../celebration/Celebration';
import { Frame } from '../components/Frame';
import { AttributeIcon, Glyph } from '../components/Icon';
import { Modal } from '../components/Modal';
import { submitOnEnter } from '../components/submitOnEnter';

export const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

export function CampaignPanel({ state }: { state: GameState }) {
  const [forging, setForging] = useState(false);
  const campaigns = state.campaignOrder.map((id) => state.campaigns[id]!);
  const active = campaigns.filter((c) => c.status === 'active');
  const completed = campaigns.filter((c) => c.status === 'complete');

  return (
    <Frame
      className="campaigns"
      label="CAMPAIGN"
      index="04"
      actions={
        active.length > 0 && (
          <button className="icon-btn" onClick={() => setForging(true)} aria-label="New campaign" title="New campaign">
            <Glyph name="plus" size={16} />
          </button>
        )
      }
    >
      {active.length === 0 && (
        <div className="campaigns__empty">
          <p>
            <strong>No campaign underway.</strong> Big goals are just quests wearing a trench coat. Break one into chapters
            and watch it fall.
          </p>
          <button className="btn btn--ghost" onClick={() => setForging(true)}>
            <Glyph name="flag" size={14} /> START A CAMPAIGN
          </button>
          {completed.length > 0 && (
            <div className="campaigns__done mono">
              {completed.length} CAMPAIGN{completed.length > 1 ? 'S' : ''} COMPLETED
            </div>
          )}
        </div>
      )}
      {active.map((c) => (
        <CampaignView key={c.id} campaign={c} />
      ))}
      {forging && <CampaignComposer onClose={() => setForging(false)} />}
    </Frame>
  );
}

function CampaignView({ campaign }: { campaign: Campaign }) {
  const { act } = useCelebration();
  const cleared = campaign.chapters.filter((c) => c.clearedAt).length;
  const pct = Math.round((cleared / campaign.chapters.length) * 100);
  const nextIndex = campaign.chapters.findIndex((c) => !c.clearedAt);
  const [confirmRetire, setConfirmRetire] = useState(false);
  const isFinal = nextIndex === campaign.chapters.length - 1;

  return (
    <div className="campaign" style={{ '--accent': `var(--attr-${campaign.attribute})` } as React.CSSProperties}>
      <div className="campaign__name">{campaign.name}</div>
      <div className="campaign__progress">
        <div className="campaign__bar">
          <span style={{ width: `${pct}%` }} />
          {campaign.chapters.map((_, i) => (
            <i key={i} style={{ left: `${((i + 1) / campaign.chapters.length) * 100}%` }} />
          ))}
        </div>
        <span className="campaign__pct mono">{pct}%</span>
      </div>
      <ol className="chapters">
        {campaign.chapters.map((ch, i) => {
          const state = ch.clearedAt ? 'cleared' : i === nextIndex ? 'current' : 'locked';
          return (
            <li key={ch.id} className={`chapter chapter--${state}`}>
              <span className="chapter__num mono">{ROMAN[i]}</span>
              <span className="chapter__title">{ch.title}</span>
              {state === 'cleared' && <Glyph name="check" size={14} className="chapter__icon" />}
              {state === 'locked' && <Glyph name="lock" size={12} className="chapter__icon" />}
              {state === 'current' && (
                <button
                  className="btn btn--small chapter__clear"
                  onClick={(e) => act({ type: 'clearChapter', campaignId: campaign.id, chapterId: ch.id }, { origin: e.currentTarget })}
                  title={isFinal ? `Final chapter: +${CHAPTER_XP + CAMPAIGN_COMPLETE_BONUS_XP} XP` : `+${CHAPTER_XP} XP`}
                >
                  CLEAR <span className="gold">+{isFinal ? CHAPTER_XP + CAMPAIGN_COMPLETE_BONUS_XP : CHAPTER_XP}</span>
                </button>
              )}
            </li>
          );
        })}
      </ol>
      <div className="campaign__foot mono">
        <span>
          <AttributeIcon attribute={campaign.attribute} size={11} /> {campaign.attribute}
        </span>
        {confirmRetire ? (
          <span className="campaign__retire-confirm">
            Shelve it?{' '}
            <button onClick={() => act({ type: 'retireCampaign', campaignId: campaign.id })}>YES</button>
            <button onClick={() => setConfirmRetire(false)}>NO</button>
          </span>
        ) : (
          <button className="campaign__retire" onClick={() => setConfirmRetire(true)}>
            SHELVE
          </button>
        )}
      </div>
    </div>
  );
}

function CampaignComposer({ onClose }: { onClose: () => void }) {
  const { act } = useCelebration();
  const [name, setName] = useState('');
  const [attribute, setAttribute] = useState<Attribute>('INT');
  const [chapters, setChapters] = useState<string[]>(['', '', '']);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLOListElement>(null);

  const setChapter = (i: number, value: string) => setChapters((cs) => cs.map((c, j) => (j === i ? value : c)));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const r = act({ type: 'createCampaign', name, attribute, chapters });
    if (r.ok) onClose();
    else setError(r.error);
  };

  const filled = chapters.filter((c) => c.trim()).length;
  const potential = filled * CHAPTER_XP + (filled > 0 ? CAMPAIGN_COMPLETE_BONUS_XP : 0);

  return (
    <Modal title="Start a Campaign" kicker="LONG-TERM GOAL" onClose={onClose} wide>
      <form className="composer" onSubmit={submit} onKeyDown={submitOnEnter}>
        <label className="field">
          <span className="field__label mono">THE AMBITION</span>
          <input
            className="field__input field__input--big"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={LIMITS.campaignNameMax}
            placeholder="Become a quantum engineer"
            data-autofocus
            autoComplete="off"
          />
        </label>

        <div className="field">
          <span className="field__label mono">PRIMARY ATTRIBUTE</span>
          <div className="attr-picker">
            {ATTRIBUTES.map((a) => (
              <button
                type="button"
                key={a}
                className={`attr-option ${attribute === a ? 'is-selected' : ''}`}
                style={{ '--accent': `var(--attr-${a})` } as React.CSSProperties}
                onClick={() => setAttribute(a)}
                aria-pressed={attribute === a}
              >
                <AttributeIcon attribute={a} size={18} />
                <span className="mono">{a}</span>
                <small>{ATTRIBUTE_INFO[a].name}</small>
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span className="field__label mono">
            CHAPTERS <span className="dim">· cleared in order, each one +{CHAPTER_XP} XP</span>
          </span>
          <ol className="chapter-inputs" ref={listRef}>
            {chapters.map((c, i) => (
              <li key={i}>
                <span className="mono chapter-inputs__num">{ROMAN[i]}</span>
                <input
                  className="field__input"
                  value={c}
                  maxLength={LIMITS.questTitleMax}
                  onChange={(e) => setChapter(i, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return;
                    e.preventDefault();
                    if (i === chapters.length - 1 && c.trim() && chapters.length < LIMITS.chaptersMax) setChapters((cs) => [...cs, '']);
                    // Focus after React renders a possibly-new input.
                    window.requestAnimationFrame(() => listRef.current?.querySelectorAll('input')[i + 1]?.focus());
                  }}
                  placeholder={['Learn the fundamentals', 'Build the first project', 'Ship something real'][i] ?? 'Next chapter'}
                />
                {chapters.length > 1 && (
                  <button type="button" className="icon-btn" aria-label="Remove chapter" onClick={() => setChapters((cs) => cs.filter((_, j) => j !== i))}>
                    <Glyph name="close" size={14} />
                  </button>
                )}
              </li>
            ))}
          </ol>
          {chapters.length < LIMITS.chaptersMax && (
            <button type="button" className="btn btn--ghost btn--small" onClick={() => setChapters((cs) => [...cs, ''])}>
              <Glyph name="plus" size={12} /> ADD CHAPTER
            </button>
          )}
        </div>

        {error && <div className="composer__error mono">{error}</div>}

        <footer className="composer__footer">
          <div className="composer__preview mono">
            {filled} CHAPTER{filled === 1 ? '' : 'S'} · <span className="gold">{potential.toLocaleString()} XP</span> ON THE TABLE
          </div>
          <button className="btn btn--gold btn--lg" disabled={!name.trim() || filled === 0}>
            BEGIN CAMPAIGN
          </button>
        </footer>
      </form>
    </Modal>
  );
}
