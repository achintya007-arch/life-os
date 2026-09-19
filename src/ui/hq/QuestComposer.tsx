import { useState } from 'react';
import { ATTRIBUTES, ATTRIBUTE_INFO, BOSS_MAX_HITS, BOSS_STRIKE_XP, LIMITS, TIERS, TIER_INFO, type Attribute, type Cadence, type Tier } from '../../engine/constants';
import { inferAttribute, inferTier } from '../../engine/infer';
import type { Quest, QuestDraft } from '../../engine/types';
import { useCelebration } from '../celebration/Celebration';
import { AttributeIcon, Glyph, TierIcon } from '../components/Icon';
import { Modal } from '../components/Modal';
import { submitOnEnter } from '../components/submitOnEnter';

export function QuestComposer({ quest, onClose }: { quest?: Quest; onClose: () => void }) {
  const { act } = useCelebration();
  const editing = Boolean(quest);
  const [title, setTitle] = useState(quest?.title ?? '');
  const [notes, setNotes] = useState(quest?.notes ?? '');
  const [tier, setTier] = useState<Tier>(quest?.tier ?? 'standard');
  const [attribute, setAttribute] = useState<Attribute>(quest?.attribute ?? 'INT');
  const [cadence, setCadence] = useState<Cadence>(quest?.cadence ?? 'once');
  const [hits, setHits] = useState<number>(quest?.hits ?? 1);
  const isBoss = tier === 'boss' && cadence === 'once';
  // Auto-suggest until the player makes a choice themselves.
  const [attrTouched, setAttrTouched] = useState(editing);
  const [tierTouched, setTierTouched] = useState(editing);
  const [error, setError] = useState<string | null>(null);

  const onTitle = (value: string) => {
    setTitle(value);
    if (!attrTouched) {
      const inferred = inferAttribute(value);
      if (inferred) setAttribute(inferred);
    }
    if (!tierTouched) setTier(inferTier(value) ?? 'standard');
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const draft: QuestDraft = { title, notes, tier, attribute, cadence, ...(isBoss ? { hits } : quest?.hits ? { hits: 1 } : {}) };
    const r = quest
      ? act({ type: 'editQuest', questId: quest.id, changes: draft })
      : act({ type: 'createQuest', quest: draft });
    if (r.ok) onClose();
    else setError(r.error);
  };

  const attrInferred = !attrTouched && inferAttribute(title) === attribute;

  return (
    <Modal title={editing ? 'Edit Quest' : 'Forge a Quest'} kicker={editing ? 'QUEST LOG · EDIT' : 'QUEST LOG · NEW ENTRY'} onClose={onClose} wide>
      <form className="composer" onSubmit={submit} onKeyDown={submitOnEnter}>
        <label className="field">
          <span className="field__label mono">OBJECTIVE</span>
          <input
            className="field__input field__input--big"
            value={title}
            onChange={(e) => onTitle(e.target.value)}
            maxLength={LIMITS.questTitleMax}
            placeholder="Practice guitar for 30 minutes"
            data-autofocus
            autoComplete="off"
          />
        </label>

        <div className="field">
          <span className="field__label mono">
            DIFFICULTY <span className="dim">· how much it asks of you</span>
          </span>
          <div className="tier-picker">
            {TIERS.map((t) => (
              <button
                type="button"
                key={t}
                className={`tier-option tier-option--${t} ${tier === t ? 'is-selected' : ''}`}
                onClick={() => {
                  setTier(t);
                  setTierTouched(true);
                }}
                aria-pressed={tier === t}
              >
                <TierIcon tier={t} size={20} />
                <span className="tier-option__label">{TIER_INFO[t].label}</span>
                <span className="tier-option__xp mono">+{TIER_INFO[t].xp} XP</span>
                <span className="tier-option__blurb">{TIER_INFO[t].blurb}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span className="field__label mono">
            ATTRIBUTE {attrInferred && <span className="field__auto">· auto-detected</span>}
          </span>
          <div className="attr-picker">
            {ATTRIBUTES.map((a) => (
              <button
                type="button"
                key={a}
                className={`attr-option ${attribute === a ? 'is-selected' : ''}`}
                style={{ '--accent': `var(--attr-${a})` } as React.CSSProperties}
                onClick={() => {
                  setAttribute(a);
                  setAttrTouched(true);
                }}
                aria-pressed={attribute === a}
                title={ATTRIBUTE_INFO[a].domain}
              >
                <AttributeIcon attribute={a} size={18} />
                <span className="mono">{a}</span>
                <small>{ATTRIBUTE_INFO[a].name}</small>
              </button>
            ))}
          </div>
        </div>

        {isBoss && (
          <div className="field">
            <span className="field__label mono">
              BOSS HP <span className="dim">· how many sessions it takes to defeat</span>
            </span>
            <div className="boss-hp">
              {Array.from({ length: BOSS_MAX_HITS }, (_, i) => i + 1).map((n) => (
                <button key={n} type="button" className={`boss-hp__pip ${n <= hits ? 'is-on' : ''}`} onClick={() => setHits(n)} aria-label={`${n} HP`} aria-pressed={n === hits} />
              ))}
              <span className="boss-hp__label mono">
                {hits === 1 ? 'ONE-HIT BOSS' : `${hits} STRIKES · +${BOSS_STRIKE_XP} XP EACH, +${TIER_INFO.boss.xp} ON THE KILL`}
              </span>
            </div>
          </div>
        )}

        <div className="composer__row">
          <div className="field">
            <span className="field__label mono">RHYTHM</span>
            <div className="segmented">
              <button type="button" className={cadence === 'once' ? 'is-selected' : ''} onClick={() => setCadence('once')}>
                <Glyph name="flag" size={13} /> ONE-TIME
              </button>
              <button type="button" className={cadence === 'daily' ? 'is-selected' : ''} onClick={() => setCadence('daily')}>
                <Glyph name="repeat" size={13} /> DAILY RITUAL
              </button>
            </div>
          </div>
          <label className="field composer__notes">
            <span className="field__label mono">
              NOTES <span className="dim">· optional</span>
            </span>
            <input className="field__input" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={LIMITS.notesMax} placeholder="Why it matters, or where to start" />
          </label>
        </div>

        {error && <div className="composer__error mono">{error}</div>}

        <footer className="composer__footer">
          <div className="composer__preview mono" style={{ '--accent': `var(--attr-${attribute})` } as React.CSSProperties}>
            <TierIcon tier={tier} size={14} />
            <span className="composer__preview-title">{title.trim() || 'Untitled quest'}</span>
            <span className="gold">+{TIER_INFO[tier].xp} XP</span>
            <span style={{ color: 'var(--accent)' }}>{attribute}</span>
          </div>
          <button className="btn btn--gold btn--lg" disabled={!title.trim()}>
            {editing ? 'SAVE QUEST' : 'ACCEPT QUEST'}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
