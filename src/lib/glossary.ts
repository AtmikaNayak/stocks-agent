export interface GlossaryEntry {
  term: string;
  /** One sentence anyone can follow. */
  oneLiner: string;
  /** Why a first-time investor should care. */
  whyItMatters: string;
  category: 'Basics' | 'Company health' | 'Costs' | 'Risk';
  alsoKnownAs?: string;
}

/**
 * Every definition here is written for someone who has never bought a share.
 * Short sentence first, then the reason it matters.
 */
export const GLOSSARY: GlossaryEntry[] = [
  {
    term: 'Share (or stock)',
    oneLiner: 'A small slice of ownership in a company.',
    whyItMatters:
      'Owning a share means you benefit when the business does well — and lose when it does not. You are a part-owner, not a lender.',
    category: 'Basics',
  },
  {
    term: 'Investing vs trading',
    oneLiner:
      'Investing means holding good businesses for years; trading means buying and selling quickly to catch short moves.',
    whyItMatters:
      'InvestPilot is built around long-term investing. Quick trading needs far more time, skill and luck than most beginners expect.',
    category: 'Basics',
  },
  {
    term: 'Portfolio',
    oneLiner: 'Simply the collection of investments you own.',
    whyItMatters:
      'Looking at the whole portfolio — not one share — tells you whether you are taking sensible risk.',
    category: 'Basics',
  },
  {
    term: 'NSE and BSE',
    oneLiner: 'India’s two main stock exchanges, where shares change hands.',
    whyItMatters:
      'Prices you see are agreed on an exchange. In this demo build the prices are sample fixtures, not live exchange quotes.',
    category: 'Basics',
  },
  {
    term: 'Average buy price',
    oneLiner: 'The blended price you paid for the shares you own.',
    whyItMatters:
      'If you buy the same share twice at different prices, this is the number to compare with today’s price.',
    category: 'Basics',
  },
  {
    term: 'Unrealised profit / loss',
    oneLiner: 'The gain or loss on shares you still hold.',
    whyItMatters:
      'It is only on paper until you sell. Prices move, so treat it as information rather than money in hand.',
    category: 'Basics',
  },
  {
    term: 'P/E ratio',
    oneLiner: 'How many rupees investors pay for each ₹1 of a company’s yearly profit.',
    alsoKnownAs: 'Price-to-Earnings',
    whyItMatters:
      'A high P/E means people expect fast growth. A low P/E can mean good value — or trouble. It only makes sense when compared with similar companies.',
    category: 'Company health',
  },
  {
    term: 'ROCE',
    oneLiner: 'How much profit a company squeezes out of every ₹100 of capital it uses.',
    alsoKnownAs: 'Return on Capital Employed',
    whyItMatters:
      'Consistently high ROCE suggests a business that does not need to keep pouring money in to earn a profit.',
    category: 'Company health',
  },
  {
    term: 'Debt-to-equity',
    oneLiner: 'How much the company borrows compared with what its owners have put in.',
    alsoKnownAs: 'D/E',
    whyItMatters:
      'A heavily borrowed company can struggle when sales slow or interest rates rise. Lower is usually calmer.',
    category: 'Company health',
  },
  {
    term: 'STT',
    oneLiner: 'A government tax charged whenever shares are bought or sold in India.',
    alsoKnownAs: 'Securities Transaction Tax',
    whyItMatters:
      'It is a real cost, even in practice mode. It is why frequent trading quietly eats into returns.',
    category: 'Costs',
  },
  {
    term: 'Brokerage, GST and stamp duty',
    oneLiner: 'The small fees a broker, the government and the exchange charge on each trade.',
    whyItMatters:
      'On a ₹1,000 order these add up to a few rupees. InvestPilot shows them before you confirm so there are no surprises.',
    category: 'Costs',
  },
  {
    term: 'CNC vs MIS',
    oneLiner:
      'CNC means you keep the shares in your account; MIS means an intraday position that must be closed the same day.',
    whyItMatters:
      'Beginners should stick to CNC (delivery). Intraday positions are forced closed and can lose money quickly.',
    category: 'Basics',
  },
  {
    term: 'Diversification',
    oneLiner: 'Spreading money across different companies and sectors.',
    whyItMatters:
      'One company’s bad news then hurts less. InvestPilot enforces this with a 15% cap per share.',
    category: 'Risk',
  },
  {
    term: 'Drawdown',
    oneLiner: 'How far your portfolio has fallen from its highest point.',
    whyItMatters:
      'A 10% drawdown means you would have been down 10% at the worst moment — a useful test of whether you can stay calm.',
    category: 'Risk',
  },
  {
    term: 'Liquidity',
    oneLiner: 'How easily you can turn an investment into cash without moving the price.',
    whyItMatters:
      'Keeping 20% in cash means you can act without being forced to sell something at a bad time.',
    category: 'Risk',
  },
  {
    term: 'Slippage',
    oneLiner: 'The gap between the price you expected and the price you actually got.',
    whyItMatters:
      'Busy markets fill orders slightly worse than the screen shows. It is a hidden cost of trading too often.',
    category: 'Costs',
  },
  {
    term: 'SIP',
    oneLiner: 'Investing a fixed amount at regular intervals instead of all at once.',
    alsoKnownAs: 'Systematic Investment Plan',
    whyItMatters:
      'It smooths out the effect of price swings and removes the pressure of picking the perfect moment.',
    category: 'Basics',
  },
];
