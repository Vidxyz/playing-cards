'use client'

const CAMBIO_POWERS = [
  { rank: '7 / 8',    label: 'Peek your own',     desc: 'Look at one of your own face-down cards for 3 seconds.' },
  { rank: '9 / 10',   label: 'Peek opponent',      desc: "Look at one of any opponent's face-down cards for 3 seconds." },
  { rank: 'J / Q',    label: 'Blind swap',         desc: 'Swap any one of your cards with any one opponent card — neither of you looks.' },
  { rank: 'Red K',    label: 'Peek then swap',     desc: 'Peek any card on the table; then optionally swap it with one of your own. Red Kings are worth 13 pts.' },
  { rank: 'Black K',  label: '0 points',           desc: 'No power — but worth 0 pts, so keep it if you have it.' },
  { rank: 'Joker',    label: '0 points',           desc: 'No power — worth 0 pts.' },
]

export function CambioTutorialModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-t-3xl overflow-y-auto card-slide"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', maxHeight: '88vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 sticky top-0"
          style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
          <div>
            <h2 className="font-bold text-base" style={{ color: 'var(--text)' }}>How to Play Cambio</h2>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Lowest total card value wins</p>
          </div>
          <button onClick={onClose} className="text-sm px-3 py-1 rounded-full"
            style={{ background: 'var(--surface-mid)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
            Close
          </button>
        </div>

        <div className="px-5 pb-8 pt-4 flex flex-col gap-5">

          <TutSection icon="🎯" title="Goal">
            <p>Each player has 4 face-down cards in a 2×2 grid. Have the <strong>lowest total point value</strong> when the round ends.</p>
            <p className="mt-1.5">A = 1 · 2–10 = face value · J/Q = 10 · Red K = 13 · Black K = 0</p>
          </TutSection>

          <TutSection icon="👀" title="Start of Round — Initial Peek">
            <p>Before anyone draws, you get to peek at your <strong>2 bottom cards</strong> for a few seconds. Memorise them — you won't see them again unless you use a power.</p>
          </TutSection>

          <TutSection icon="🃏" title="On Your Turn — Draw">
            <p>Each turn you must do one of two things:</p>
            <div className="flex flex-col gap-2 mt-2">
              <Row label="Draw from deck" desc="Tap the deck. You see the card privately. Then choose: swap it into one of your grid slots, or discard it." />
              <Row label="Take from discard" desc="Tap the discard pile. You must swap it into one of your slots — you cannot discard it back." />
            </div>
          </TutSection>

          <TutSection icon="🔄" title="After Drawing — Swap or Discard">
            <p>After drawing from the deck:</p>
            <div className="flex flex-col gap-2 mt-2">
              <Row label="Swap" desc="Tap one of your grid cards. Your drawn card goes there; the old card goes to the discard pile." />
              <Row label="Discard (no power)" desc="Cards below 7 — just tap Discard. Card leaves your hand, nothing happens." />
              <Row label="Discard (use power)" desc="Cards 7 and above — tap 'Use Power' to activate the card's ability, or tap 'Discard' to skip it." />
            </div>
          </TutSection>

          <TutSection icon="⚡" title="Card Powers (activated on discard)">
            <div className="flex flex-col gap-2 mt-1">
              {CAMBIO_POWERS.map(p => (
                <div key={p.rank} className="flex gap-3 rounded-xl px-3 py-2.5"
                  style={{ background: 'var(--surface-mid)', border: '1px solid var(--border)' }}>
                  <div className="flex-shrink-0 text-center" style={{ minWidth: 36 }}>
                    <span className="font-black text-[11px]" style={{ color: 'var(--accent)' }}>{p.rank}</span>
                  </div>
                  <div>
                    <div className="text-xs font-bold" style={{ color: 'var(--text)' }}>{p.label}</div>
                    <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{p.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </TutSection>

          <TutSection icon="📌" title="Sticking — Quick-play a matching card">
            <p>At <strong>any time</strong> (your turn or not), if the top of the discard matches one of your cards, you can stick it:</p>
            <div className="flex flex-col gap-2 mt-2">
              <Row label="How to stick" desc="Tap your card once (it glows green), then tap it again to confirm." />
              <Row label="Success ✓" desc="Your card is discarded and that slot is gone — fewer cards means a lower potential score." />
              <Row label="Wrong card ✗" desc="You get a penalty card added to your grid. More cards = higher score risk." />
            </div>
            <p className="text-[11px] mt-2.5 px-3 py-2 rounded-xl"
              style={{ background: 'rgba(239,68,68,0.08)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
              You can only stick before you've drawn on your turn. Once you draw, you must complete that action first.
            </p>
          </TutSection>

          <TutSection icon="🔔" title="Calling Cambio">
            <p>When you think you have the lowest total, tap <strong>Call Cambio</strong> instead of drawing. Every other player gets exactly one more turn, then all cards are revealed and scored.</p>
            <p className="text-[11px] mt-1.5" style={{ color: 'var(--text-muted)' }}>You can only call Cambio at the start of your turn, before drawing or sticking.</p>
          </TutSection>

        </div>
      </div>
    </div>
  )
}

export function BluffTutorialModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-t-3xl overflow-y-auto card-slide"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', maxHeight: '88vh' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3 sticky top-0"
          style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
          <div>
            <h2 className="font-bold text-base" style={{ color: 'var(--text)' }}>How to Play Bluff</h2>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>aka BS — get rid of all your cards</p>
          </div>
          <button onClick={onClose} className="text-sm px-3 py-1 rounded-full"
            style={{ background: 'var(--surface-mid)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
            Close
          </button>
        </div>

        <div className="px-5 pb-8 pt-4 flex flex-col gap-5">

          <TutSection icon="🎯" title="Goal">
            <p>Get rid of all your cards first. On your turn you <strong>must</strong> play cards — and you can lie about what you're playing.</p>
          </TutSection>

          <TutSection icon="🃏" title="On Your Turn — Play & Declare">
            <p>Select one or more cards from your hand and tap <strong>Declare & Play</strong>. You must claim a rank and a count:</p>
            <div className="flex flex-col gap-2 mt-2">
              <Row label="Pick a rank" desc='Choose any rank — e.g. "Kings". You can lie.' />
              <Row label="Pick a count" desc="Choose how many you claim to be playing. This can also be a lie." />
              <Row label="Confirm" desc='Tap "Claim N Rank & Play". Cards go face-down onto the pile.' />
            </div>
            <p className="text-[11px] mt-2 px-3 py-2 rounded-xl"
              style={{ background: 'rgba(245,158,11,0.08)', color: 'var(--accent)', border: '1px solid rgba(245,158,11,0.2)' }}>
              Your hand stays sorted by rank automatically — use this to spot your groups quickly.
            </p>
          </TutSection>

          <TutSection icon="🎭" title="Calling Bluff">
            <p>After any player plays, anyone can tap <strong>Call Bluff</strong> on the pile. The last-played cards are revealed:</p>
            <div className="flex flex-col gap-2 mt-2">
              <Row label="Bluff caught!" desc="If the rank or count doesn't match the claim, the submitter picks up the entire pile." />
              <Row label="Honest play" desc="If the cards exactly match the claim, the caller picks up the entire pile." />
            </div>
          </TutSection>

          <TutSection icon="🔄" title="Passing">
            <p>If you don't want to call bluff, tap <strong>Pass</strong>. Once every other player has passed, the pile is cleared and the submitter plays again.</p>
          </TutSection>

          <TutSection icon="🏆" title="Winning">
            <p>First player to empty their hand wins the round.</p>
          </TutSection>

        </div>
      </div>
    </div>
  )
}

export function EuchreTutorialModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-t-3xl overflow-y-auto card-slide"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', maxHeight: '88vh' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3 sticky top-0"
          style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
          <div>
            <h2 className="font-bold text-base" style={{ color: 'var(--text)' }}>How to Play Euchre</h2>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>2v2 trick-taking — first team to 10 points</p>
          </div>
          <button onClick={onClose} className="text-sm px-3 py-1 rounded-full"
            style={{ background: 'var(--surface-mid)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
            Close
          </button>
        </div>

        <div className="px-5 pb-8 pt-4 flex flex-col gap-5">

          <TutSection icon="🎯" title="Goal">
            <p>Two teams of two. Win tricks to score points. First team to <strong>10 points</strong> wins.</p>
            <p className="mt-1.5">Partners sit across from each other (seats 0 &amp; 2 vs seats 1 &amp; 3).</p>
          </TutSection>

          <TutSection icon="🃏" title="The Deck">
            <p>24 cards: 9, 10, J, Q, K, A of each suit. Five cards are dealt to each player; four go to the <strong>kitty</strong> face-down.</p>
          </TutSection>

          <TutSection icon="👑" title="The Bowers — most important rule">
            <p>When a trump suit is chosen, the two Jacks become the two most powerful cards:</p>
            <div className="flex flex-col gap-2 mt-2">
              <Row label="Right Bower" desc="Jack of the trump suit. Highest card in the game." />
              <Row label="Left Bower" desc="Jack of the same-colour suit. Second highest. Counts as trump — not its natural suit." />
            </div>
            <div className="mt-2.5 px-3 py-2 rounded-xl text-[11px]"
              style={{ background: 'rgba(245,158,11,0.08)', color: 'var(--accent)', border: '1px solid rgba(245,158,11,0.2)' }}>
              Example: Hearts trump → J♥ = right bower (best), J♦ = left bower (second best, counts as a heart).
            </div>
            <p className="mt-2">Trump rank (high → low): J♥ · J♦ · A♥ · K♥ · Q♥ · 10♥ · 9♥ (using hearts as example)</p>
          </TutSection>

          <TutSection icon="📢" title="Choosing Trump — Round 1">
            <p>The top kitty card is revealed. Starting left of the dealer, each player can:</p>
            <div className="flex flex-col gap-2 mt-2">
              <Row label="Order Up" desc="Make that card's suit trump. The dealer picks up the card and discards one from their hand." />
              <Row label="Pass" desc="Decline. The next player gets to decide." />
            </div>
            <p className="mt-2">If all four players pass, the card is turned face-down and Round 2 begins.</p>
          </TutSection>

          <TutSection icon="🗣️" title="Choosing Trump — Round 2">
            <p>Each player names any suit as trump — except the turned-down suit. Pass is still allowed.</p>
            <p className="mt-1.5">The dealer <strong>must</strong> name a suit if everyone else passes (stick the dealer — no further passing).</p>
          </TutSection>

          <TutSection icon="🃏" title="Playing Tricks">
            <div className="flex flex-col gap-2 mt-1">
              <Row label="Lead" desc="The player left of the dealer leads the first trick. Winners lead subsequent tricks." />
              <Row label="Follow suit" desc="You must play a card of the led suit if you have one. The left bower counts as trump, not its natural suit." />
              <Row label="Trump" desc="If you can't follow suit, play anything. Trump beats all non-trump cards." />
              <Row label="Winner" desc="Highest trump played wins; if no trump, highest card of the led suit wins." />
            </div>
          </TutSection>

          <TutSection icon="🤝" title="Going Alone">
            <p>When ordering up or naming trump, toggle <strong>Go Alone</strong>. Your partner sits out this hand.</p>
            <div className="flex flex-col gap-2 mt-2">
              <Row label="Win all 5 alone" desc="4 points instead of 2." />
              <Row label="Win 3–4 alone" desc="1 point (same as normal)." />
              <Row label="Win fewer than 3" desc="Defenders still get 2 points." />
            </div>
          </TutSection>

          <TutSection icon="🏆" title="Scoring">
            <div className="flex flex-col gap-2 mt-1">
              <Row label="Makers win 3–4 tricks" desc="1 point for the making team." />
              <Row label="Makers win all 5 (march)" desc="2 points for the making team." />
              <Row label="Going alone + all 5" desc="4 points for the making team." />
              <Row label="Euchred (makers win fewer than 3)" desc="2 points for the defending team." />
            </div>
            <p className="mt-2">First team to reach <strong>10 points</strong> wins the game.</p>
          </TutSection>

        </div>
      </div>
    </div>
  )
}

function TutSection({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span style={{ fontSize: 16 }}>{icon}</span>
        <span className="font-bold text-sm" style={{ color: 'var(--text)' }}>{title}</span>
      </div>
      <div className="text-[12px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
        {children}
      </div>
    </div>
  )
}

function Row({ label, desc }: { label: string; desc: string }) {
  return (
    <div className="flex gap-2.5 rounded-xl px-3 py-2.5"
      style={{ background: 'var(--surface-mid)', border: '1px solid var(--border)' }}>
      <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: 'var(--accent)' }} />
      <div>
        <div className="text-xs font-semibold" style={{ color: 'var(--text)' }}>{label}</div>
        <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{desc}</div>
      </div>
    </div>
  )
}
