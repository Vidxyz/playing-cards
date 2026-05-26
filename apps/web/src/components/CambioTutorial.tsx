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

export function PresidentTutorialModal({ onClose }: { onClose: () => void }) {
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
            <h2 className="font-bold text-base" style={{ color: 'var(--text)' }}>How to Play President</h2>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>aka Scum / Asshole — get rid of cards first</p>
          </div>
          <button onClick={onClose} className="text-sm px-3 py-1 rounded-full"
            style={{ background: 'var(--surface-mid)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
            Close
          </button>
        </div>

        <div className="px-5 pb-8 pt-4 flex flex-col gap-5">

          <TutSection icon="🎯" title="Goal">
            <p>Empty your hand first to become <strong>President</strong>. Last player holding cards is the <strong>Bum</strong>.</p>
          </TutSection>

          <TutSection icon="🃏" title="Card Types">
            <div className="flex flex-col gap-2 mt-1">
              <Row label="Normal cards (4–A)" desc="Standard cards. Higher rank beats lower. Same rank — suit breaks the tie (♠ › ♥ › ♣ › ♦)." />
              <Row label="Wildcards — 3s" desc="A 3 takes the rank of the cards it's played with, but keeps its own suit. Real card at the same value burns a wildcard." />
              <Row label="Special — 2s" desc="Bypass the current rank. To beat a play of N cards, you need exactly max(1, N−1) twos. Suit burns still apply." />
              <Row label="Joker" desc="Must be played alone. Beats everything and always burns the pile." />
            </div>
          </TutSection>

          <TutSection icon="⬆️" title="Playing a Combo">
            <p>On your turn, select one or more cards of the same rank (or mix in wildcards / 3s) and tap Play.</p>
            <div className="flex flex-col gap-2 mt-2">
              <Row label="Must beat the table" desc="Your combo's rank must be higher than what's on the table. Your count must match the previous count." />
              <Row label="Suit tiebreaker" desc="Same rank? Your highest suit must beat the table's highest suit: ♠ › ♥ › ♣ › ♦." />
              <Row label="Pass" desc="Skip your turn for this round. You cannot play again until the pile is cleared." />
            </div>
          </TutSection>

          <TutSection icon="🔥" title="Burns — Clearing the Pile">
            <p>A burn clears the pile and lets you (or the next player) play anything fresh.</p>
            <div className="flex flex-col gap-2 mt-2">
              <Row label="Suit burn" desc="If your highest suit is strictly above the table's highest suit, it's a burn — pile clears, you go again." />
              <Row label="Real beats wild" desc="If both have the same top suit, but yours is a real card and the table's is a wildcard (3), that's also a burn." />
              <Row label="Joker always burns" desc="A Joker always clears the pile regardless." />
            </div>
          </TutSection>

          <TutSection icon="🔄" title="Round End">
            <p>A round of play ends when either a burn happens <strong>or</strong> all-but-one players have passed. The last active player starts the next round with a fresh pile.</p>
          </TutSection>

          <TutSection icon="🏆" title="Positions (4+ players)">
            <div className="flex flex-col gap-2 mt-1">
              <Row label="👑 President (1st)" desc="Finishes first. Receives the Bum's best card(s) at the start of next round." />
              <Row label="🥈 VP (2nd)" desc="Receives the Vice Bum's best card." />
              <Row label="😐 Neutral (middle)" desc="No card exchange." />
              <Row label="😬 Vice Bum (2nd-to-last)" desc="Must give their best card to the VP." />
              <Row label="💀 Bum (last)" desc="Last to empty hand. Must give their best card(s) to the President." />
            </div>
            <p className="text-[11px] mt-2" style={{ color: 'var(--text-dim)' }}>
              Card exchange is automatic at the start of each round. The Bum starts each subsequent round — first round is random.
            </p>
          </TutSection>

          <TutSection icon="🎲" title="2-Player Note">
            <p>With only 2 players there are no VP/VB roles — just Winner and Bum. With 5+ players, two decks are used and duplicate cards are possible.</p>
          </TutSection>

        </div>
      </div>
    </div>
  )
}

export function BlackjackTutorialModal({ onClose }: { onClose: () => void }) {
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
            <h2 className="font-bold text-base" style={{ color: 'var(--text)' }}>How to Play Blackjack</h2>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Beat the dealer without going over 21</p>
          </div>
          <button onClick={onClose} className="text-sm px-3 py-1 rounded-full"
            style={{ background: 'var(--surface-mid)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
            Close
          </button>
        </div>

        <div className="px-5 pb-8 pt-4 flex flex-col gap-5">

          <TutSection icon="🎯" title="Goal">
            <p>Get a hand value closer to <strong>21</strong> than the dealer's — without going over. Each player plays against the dealer independently.</p>
          </TutSection>

          <TutSection icon="🃏" title="Card Values">
            <div className="flex flex-col gap-2 mt-1">
              <Row label="2 – 10" desc="Worth their face value." />
              <Row label="J, Q, K" desc="Worth 10 points each." />
              <Row label="Ace" desc="Worth 11 — automatically counts as 1 if 11 would bust you." />
            </div>
          </TutSection>

          <TutSection icon="🂡" title="The Deal">
            <p>Each player receives <strong>2 face-up cards</strong>. The dealer gets 1 face-up and 1 face-down (the hole card).</p>
            <p className="mt-1.5">If you are dealt exactly 21 on your first two cards, that is a <strong>Blackjack</strong> — you automatically stand and collect a 2.5× payout.</p>
          </TutSection>

          <TutSection icon="👆" title="Your Turn — Hit or Stand">
            <div className="flex flex-col gap-2 mt-1">
              <Row label="Hit" desc="Draw another card. You can hit as many times as you like." />
              <Row label="Stand" desc="Keep your current hand and end your turn." />
              <Row label="Bust" desc="If your total exceeds 21 you bust and lose your bet immediately." />
            </div>
          </TutSection>

          <TutSection icon="🤖" title="The Dealer's Turn">
            <p>After all players have stood or busted, the dealer reveals their hole card. The dealer <strong>must hit until reaching 17 or higher</strong>, then must stand.</p>
            <p className="mt-1.5">If the dealer busts, all players still in the hand win.</p>
          </TutSection>

          <TutSection icon="💰" title="Payouts">
            <div className="flex flex-col gap-2 mt-1">
              <Row label="Blackjack (21 on first 2 cards)" desc="Win 2.5× your bet." />
              <Row label="Beat the dealer" desc="Win 2× your bet." />
              <Row label="Push (tie)" desc="Your bet is returned." />
              <Row label="Lose or bust" desc="Your bet is lost." />
            </div>
          </TutSection>

          <TutSection icon="🪙" title="Chips">
            <p>Each player starts with a set number of chips. A fixed bet is deducted at the start of every hand — if you don't have enough, your bet is capped at your remaining chips.</p>
            <p className="mt-1.5">The game ends when all players are out of chips.</p>
          </TutSection>

        </div>
      </div>
    </div>
  )
}

export function PokerTutorialModal({ onClose }: { onClose: () => void }) {
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
            <h2 className="font-bold text-base" style={{ color: 'var(--text)' }}>How to Play Poker</h2>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Texas Hold'em — best 5-card hand wins</p>
          </div>
          <button onClick={onClose} className="text-sm px-3 py-1 rounded-full"
            style={{ background: 'var(--surface-mid)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
            Close
          </button>
        </div>

        <div className="px-5 pb-8 pt-4 flex flex-col gap-5">

          <TutSection icon="🎯" title="Goal">
            <p>Win chips by having the best 5-card hand at showdown, or by making everyone else fold before that.</p>
          </TutSection>

          <TutSection icon="🃏" title="The Deal">
            <p>Each player receives <strong>2 private hole cards</strong>. Five <strong>community cards</strong> are revealed in stages and shared by all players.</p>
            <p className="mt-1.5">Your best hand is any combination of your 2 hole cards and the 5 community cards.</p>
          </TutSection>

          <TutSection icon="🔄" title="Betting Rounds">
            <div className="flex flex-col gap-2 mt-1">
              <Row label="Pre-flop" desc="Hole cards dealt. Small blind and big blind post mandatory bets. Action starts left of the big blind." />
              <Row label="Flop" desc="3 community cards revealed. Betting starts left of the dealer." />
              <Row label="Turn" desc="4th community card revealed. Another betting round." />
              <Row label="River" desc="5th and final community card. Last betting round." />
              <Row label="Showdown" desc="Remaining players reveal their hands. Best hand wins the pot." />
            </div>
          </TutSection>

          <TutSection icon="👆" title="Betting Actions">
            <div className="flex flex-col gap-2 mt-1">
              <Row label="Check" desc="Pass the action — only available if no bet has been made this round." />
              <Row label="Call" desc="Match the current bet to stay in the hand." />
              <Row label="Bet / Raise" desc="Put in chips. Others must call, raise, or fold." />
              <Row label="Fold" desc="Discard your hand and forfeit your chips for this round." />
              <Row label="All-in" desc="Bet all your remaining chips. You can still win up to the amount you put in from each player." />
            </div>
          </TutSection>

          <TutSection icon="🏆" title="Hand Rankings (high → low)">
            <div className="flex flex-col gap-2 mt-1">
              <Row label="Royal Flush" desc="A K Q J 10 of the same suit." />
              <Row label="Straight Flush" desc="Five consecutive cards of the same suit." />
              <Row label="Four of a Kind" desc="Four cards of the same rank." />
              <Row label="Full House" desc="Three of a kind + a pair." />
              <Row label="Flush" desc="Five cards of the same suit (not consecutive)." />
              <Row label="Straight" desc="Five consecutive ranks (any suit). Ace can be high or low." />
              <Row label="Three of a Kind" desc="Three cards of the same rank." />
              <Row label="Two Pair" desc="Two different pairs." />
              <Row label="Pair" desc="Two cards of the same rank." />
              <Row label="High Card" desc="None of the above — highest card plays." />
            </div>
          </TutSection>

          <TutSection icon="🪙" title="Blinds & Chips">
            <p>The <strong>small blind</strong> and <strong>big blind</strong> (2× small blind) are forced bets posted before cards are dealt. The dealer button rotates each hand so blinds move around the table.</p>
            <p className="mt-1.5">A player with no chips left is eliminated. Last player with chips wins.</p>
          </TutSection>

        </div>
      </div>
    </div>
  )
}

export function GoFishTutorialModal({ onClose }: { onClose: () => void }) {
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
            <h2 className="font-bold text-base" style={{ color: 'var(--text)' }}>How to Play Go Fish</h2>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Collect sets of 4 — most books wins!</p>
          </div>
          <button onClick={onClose} className="text-sm px-3 py-1 rounded-full"
            style={{ background: 'var(--surface-mid)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
            Close
          </button>
        </div>

        <div className="px-5 pb-8 pt-4 flex flex-col gap-5">

          <TutSection icon="🎯" title="Goal">
            <p>Collect the most <strong>books</strong> — a book is all 4 cards of the same rank (e.g. all four 7s). The player with the most books when the game ends wins.</p>
          </TutSection>

          <TutSection icon="🃏" title="The Deal">
            <p>With <strong>2 players</strong>, each player gets <strong>7 cards</strong>. With <strong>3 or more players</strong>, each player gets <strong>5 cards</strong>. The rest go face-down as the draw pile.</p>
            <p className="mt-1.5">If you&apos;re dealt a complete set of 4 at the start, it&apos;s automatically booked for you.</p>
          </TutSection>

          <TutSection icon="🔄" title="On Your Turn">
            <div className="flex flex-col gap-2 mt-1">
              <Row label="Ask a player" desc="Pick any other player and name a rank you already hold in your hand. If they have any cards of that rank, they must give them all to you — and you ask again!" />
              <Row label="Go Fish!" desc='If the player you asked has none of that rank, they say "Go Fish!" — you draw one card from the pile. If the drawn card matches what you asked for (lucky fish!), you ask again. Otherwise, your turn ends.' />
            </div>
          </TutSection>

          <TutSection icon="📚" title="Books">
            <p>When you collect all 4 cards of any rank, you immediately set them aside as a <strong>book</strong>. Books are shown face-up so everyone can see your score.</p>
            <p className="mt-1.5">If completing a book empties your hand, you draw a card from the pile before play continues.</p>
          </TutSection>

          <TutSection icon="🏁" title="End of Game">
            <p>The game ends when <strong>all 13 books have been made</strong>, or the draw pile runs out and all hands are empty (whichever comes first).</p>
            <p className="mt-1.5">The player with the most books wins. Tied players share the victory.</p>
          </TutSection>

          <TutSection icon="💡" title="Strategy Tips">
            <div className="flex flex-col gap-2 mt-1">
              <Row label="Ask wisely" desc="You must already hold at least one card of the rank you ask for. Pay attention to what others ask — it reveals what ranks they're chasing." />
              <Row label="Track the pile" desc="When the draw pile is small, remember which ranks are likely still in other hands." />
              <Row label="Lucky fish" desc='Drawing the exact rank you asked for is called a "lucky fish" — you get to ask again even though no one gave you cards.' />
            </div>
          </TutSection>

        </div>
      </div>
    </div>
  )
}

export function RummyTutorialModal({ onClose }: { onClose: () => void }) {
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
            <h2 className="font-bold text-base" style={{ color: 'var(--text)' }}>How to Play Rummy</h2>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Form melds — lowest deadwood when someone goes out wins!</p>
          </div>
          <button onClick={onClose} className="text-sm px-3 py-1 rounded-full"
            style={{ background: 'var(--surface-mid)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
            Close
          </button>
        </div>

        <div className="px-5 pb-8 pt-4 flex flex-col gap-5">

          <TutSection icon="🎯" title="Goal">
            <p>Be the first to <strong>go out</strong> by melding all your cards. Everyone else scores their unmelded deadwood (cards still in hand) — you want the lowest running total. Hit the bust threshold and you&apos;re eliminated. <strong>Last player standing wins.</strong></p>
          </TutSection>

          <TutSection icon="🃏" title="The Deal">
            <p>With <strong>2 players</strong>, each gets <strong>10 cards</strong>. With <strong>3–6 players</strong>, each gets <strong>7 cards</strong>. One card is flipped face-up to start the discard pile. The rest form the draw pile.</p>
          </TutSection>

          <TutSection icon="🔄" title="On Your Turn">
            <div className="flex flex-col gap-2 mt-1">
              <Row label="1 · Draw" desc="Take the top card from the draw pile, or take the top card from the discard pile. You must draw before doing anything else." />
              <Row label="2 · (Optional) Meld" desc="Select 3 or more cards that form a valid set or run, then tap Lay Meld. You can also add a single card to one of your existing melds." />
              <Row label="3 · Discard" desc="Tap one card in your hand, then tap Discard. Your turn ends. If your hand is now empty, you go out and the round ends!" />
            </div>
          </TutSection>

          <TutSection icon="🧩" title="Melds">
            <div className="flex flex-col gap-2 mt-1">
              <Row label="Set (3 or 4 of a kind)" desc="Three or four cards of the same rank, any suits. Example: 7♠ 7♥ 7♦ — or with a joker: 7♠ 7♥ JKR." />
              <Row label="Run (3+ consecutive, same suit)" desc="Three or more consecutive ranks all in the same suit. Example: 5♥ 6♥ 7♥ — or with a joker filling a gap: 5♥ JKR 7♥. Ace is always low (A–2–3 is valid; Q–K–A is not)." />
            </div>
            <p className="mt-2">Jokers are wildcards — they count as any card in a meld. They&apos;re worth <strong>25 pts</strong> of deadwood if caught in your hand!</p>
          </TutSection>

          <TutSection icon="📊" title="Scoring">
            <p>When a player goes out, everyone else scores the cards <strong>still in their hand</strong> (unmelded deadwood):</p>
            <div className="mt-2 flex flex-col gap-1.5">
              {[
                { label: 'Joker', pts: '25 pts' },
                { label: 'J / Q / K', pts: '10 pts' },
                { label: 'A', pts: '1 pt' },
                { label: '2 – 10', pts: 'Face value' },
              ].map(row => (
                <div key={row.label} className="flex justify-between items-center px-3 py-2 rounded-lg"
                  style={{ background: 'var(--surface-mid)', border: '1px solid var(--border)' }}>
                  <span className="text-xs font-bold" style={{ color: 'var(--text)' }}>{row.label}</span>
                  <span className="text-xs font-semibold" style={{ color: 'var(--accent)' }}>{row.pts}</span>
                </div>
              ))}
            </div>
            <p className="mt-2">Scores accumulate across rounds. The player who goes out scores <strong>0</strong> for that round.</p>
          </TutSection>

          <TutSection icon="💥" title="Bust &amp; Elimination">
            <p>Once a player&apos;s <strong>total score reaches or exceeds the bust threshold</strong> (set by the host before the game), they are eliminated. The game continues until only one player remains — they win!</p>
          </TutSection>

          <TutSection icon="💡" title="Strategy Tips">
            <div className="flex flex-col gap-2 mt-1">
              <Row label="Keep an eye on discards" desc="Draw from the discard pile only if it completes a meld — otherwise you're giving opponents information about your hand." />
              <Row label="Dump high-value cards" desc="Unmelded Jacks, Queens, Kings and Jokers are expensive if someone goes out. Discard them early if they don't fit your melds." />
              <Row label="Go Rummy" desc="If you meld all your cards in one turn without any prior melds, you go out immediately — no discard needed." />
            </div>
          </TutSection>

        </div>
      </div>
    </div>
  )
}

export function CrazyEightsTutorialModal({ onClose }: { onClose: () => void }) {
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
            <h2 className="font-bold text-base" style={{ color: 'var(--text)' }}>How to Play Crazy Eights</h2>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Empty your hand first — 8s are wild!</p>
          </div>
          <button onClick={onClose} className="text-sm px-3 py-1 rounded-full"
            style={{ background: 'var(--surface-mid)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
            Close
          </button>
        </div>

        <div className="px-5 pb-8 pt-4 flex flex-col gap-5">

          <TutSection icon="🎯" title="Goal">
            <p>Be the <strong>first player to empty your hand</strong> each round. When you do, all other players score the cards remaining in their hands. Accumulate too many points and you&apos;re eliminated. Last player standing wins.</p>
          </TutSection>

          <TutSection icon="🃏" title="The Deal">
            <p>With <strong>2 players</strong>, each gets <strong>7 cards</strong>. With <strong>3–6 players</strong>, each gets <strong>5 cards</strong>. One card is flipped face-up to start the discard pile (if it&apos;s an 8, it&apos;s buried and another card is flipped). The rest form the draw pile.</p>
          </TutSection>

          <TutSection icon="🔄" title="On Your Turn">
            <div className="flex flex-col gap-2 mt-1">
              <Row label="Play a card" desc="You may play any card from your hand that matches the top discard's suit or rank. Example: if the top card is 7♥, you can play any Heart or any 7." />
              <Row label="Play an 8 (wild)" desc="You can always play an 8 regardless of the current suit or rank. When you do, you declare the new suit for the next player. Green-glowing cards are valid plays." />
              <Row label="Draw if stuck" desc="If you have no playable card, tap the deck to draw one card. If it's playable, you can play it immediately — otherwise you just keep it and your turn ends." />
            </div>
          </TutSection>

          <TutSection icon="8️⃣" title="8s — Wild Cards">
            <p>Eights can be played on <strong>any card at any time</strong>. When you play an 8, a suit picker appears — choose the suit you want the next player to match. The declared suit is shown on screen so everyone can see.</p>
          </TutSection>

          <TutSection icon="📊" title="Scoring">
            <p>When a player empties their hand, everyone else scores the cards <strong>still in their hand</strong>:</p>
            <div className="mt-2 flex flex-col gap-1.5">
              {[
                { label: '8', pts: '50 pts' },
                { label: 'J / Q / K', pts: '10 pts' },
                { label: 'A', pts: '1 pt' },
                { label: '2 – 10 (not 8)', pts: 'Face value' },
              ].map(row => (
                <div key={row.label} className="flex justify-between items-center px-3 py-2 rounded-lg"
                  style={{ background: 'var(--surface-mid)', border: '1px solid var(--border)' }}>
                  <span className="text-xs font-bold" style={{ color: 'var(--text)' }}>{row.label}</span>
                  <span className="text-xs font-semibold" style={{ color: 'var(--accent)' }}>{row.pts}</span>
                </div>
              ))}
            </div>
            <p className="mt-2">Scores accumulate across rounds. The player who empties their hand scores <strong>0</strong> for that round.</p>
          </TutSection>

          <TutSection icon="💥" title="Bust &amp; Elimination">
            <p>Once a player&apos;s <strong>total score reaches or exceeds the bust threshold</strong> (set by the host), they are eliminated. The game continues until only one player remains — they win!</p>
          </TutSection>

          <TutSection icon="💡" title="Strategy Tips">
            <div className="flex flex-col gap-2 mt-1">
              <Row label="Save your 8s" desc="Eights are powerful get-out-of-jail cards. Don't waste them early — use them when you're truly stuck, or to end the game by playing your last card." />
              <Row label="Declare a suit you hold" desc="When you play an 8, always declare a suit you have other cards in — this gives you a free play next time if the suit holds." />
              <Row label="Shed high cards early" desc="J, Q, K and especially 8s carry big points. Dump them before the round ends if they don't fit." />
            </div>
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
