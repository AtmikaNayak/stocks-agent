import db from '../../db';
import { MarketQuote, AssetFundamental, DataFreshness } from '../types';

export interface IMarketDataProvider {
  getQuote(symbol: string): Promise<MarketQuote | null>;
  getAllQuotes(): Promise<MarketQuote[]>;
  getHistoricalCandles(symbol: string, limit?: number): Promise<any[]>;
  getFundamentals(symbol: string): Promise<AssetFundamental | null>;
  getMarketSessionStatus(): {
    isOpen: boolean;
    exchange: string;
    session: 'PRE_OPEN' | 'REGULAR' | 'POST_CLOSE' | 'CLOSED';
    nextOpenIST: string;
    currentTimeIST: string;
    message: string;
  };
}

export class MarketDataService implements IMarketDataProvider {
  async getQuote(symbol: string): Promise<MarketQuote | null> {
    const asset = db.queryOne<{ id: string; symbol: string; name: string }>(
      'SELECT id, symbol, name FROM assets WHERE symbol = ?',
      [symbol.toUpperCase()]
    );
    if (!asset) return null;

    const latestPoint = db.queryOne<{
      open: number;
      high: number;
      low: number;
      close: number;
      volume: number;
      vwap: number;
      timestamp: string;
      provider: string;
      freshness_status: DataFreshness;
      quality_score: number;
      retrieved_at: string;
    }>(
      `SELECT * FROM market_data_points 
       WHERE asset_id = ? 
       ORDER BY timestamp DESC LIMIT 1`,
      [asset.id]
    );

    if (!latestPoint) return null;
    if (
      !Number.isFinite(latestPoint.close) || latestPoint.close <= 0 ||
      !Number.isFinite(latestPoint.open) || latestPoint.open <= 0 ||
      !Number.isFinite(latestPoint.high) || latestPoint.high <= 0 ||
      !Number.isFinite(latestPoint.low) || latestPoint.low <= 0
    ) return null;

    // Flag old or future-dated non-synthetic quotes as stale. Synthetic fixtures
    // remain visible for simulator demos but are never represented as live data.
    const pointTimestamp = Date.parse(`${latestPoint.timestamp}T00:00:00Z`);
    const quoteAgeMs = Date.now() - pointTimestamp;
    const maxQuoteAgeMs = 5 * 24 * 60 * 60 * 1000;
    const timestampInvalid = !Number.isFinite(pointTimestamp) || quoteAgeMs < -5 * 60 * 1000;
    const isStale = latestPoint.freshness_status === 'STALE' ||
      timestampInvalid ||
      (latestPoint.freshness_status !== 'SYNTHETIC' && quoteAgeMs > maxQuoteAgeMs);
    const quoteFreshness: DataFreshness = latestPoint.freshness_status === 'SYNTHETIC'
      ? 'SYNTHETIC'
      : isStale ? 'STALE' : latestPoint.freshness_status;

    // Previous close for change calculation
    const prevPoint = db.queryOne<{ close: number }>(
      `SELECT close FROM market_data_points 
       WHERE asset_id = ? AND timestamp < ? 
       ORDER BY timestamp DESC LIMIT 1`,
      [asset.id, latestPoint.timestamp]
    );

    const prevClose = prevPoint?.close || latestPoint.open;
    const change = Math.round((latestPoint.close - prevClose) * 100) / 100;
    const changePct = Math.round((change / prevClose) * 10000) / 100;

    return {
      symbol: asset.symbol,
      assetId: asset.id,
      name: asset.name,
      price: latestPoint.close,
      open: latestPoint.open,
      high: latestPoint.high,
      low: latestPoint.low,
      close: latestPoint.close,
      change,
      changePct,
      volume: latestPoint.volume,
      vwap: latestPoint.vwap || latestPoint.close,
      timestamp: latestPoint.timestamp,
      provider: latestPoint.provider,
      freshness: quoteFreshness,
      qualityScore: latestPoint.quality_score
    };
  }

  async getAllQuotes(): Promise<MarketQuote[]> {
    const assets = db.query<{ id: string; symbol: string; name: string }>(
      'SELECT id, symbol, name FROM assets WHERE is_tradable = 1 ORDER BY symbol ASC'
    );

    const quotes: MarketQuote[] = [];
    for (const a of assets) {
      const q = await this.getQuote(a.symbol);
      if (q) quotes.push(q);
    }
    return quotes;
  }

  async getHistoricalCandles(symbol: string, limit = 30): Promise<any[]> {
    const asset = db.queryOne<{ id: string }>(
      'SELECT id FROM assets WHERE symbol = ?',
      [symbol.toUpperCase()]
    );
    if (!asset) return [];

    return db.query(
      `SELECT timestamp, open, high, low, close, volume, vwap, provider, freshness_status 
       FROM market_data_points 
       WHERE asset_id = ? 
       ORDER BY timestamp ASC LIMIT ?`,
      [asset.id, limit]
    );
  }

  async getFundamentals(symbol: string): Promise<AssetFundamental | null> {
    const asset = db.queryOne<{ id: string; symbol: string; name: string; sector: string }>(
      'SELECT id, symbol, name, sector FROM assets WHERE symbol = ?',
      [symbol.toUpperCase()]
    );
    if (!asset) return null;

    const f = db.queryOne<{
      market_cap: number;
      pe_ratio: number;
      pb_ratio: number;
      dividend_yield: number;
      roe: number;
      roce: number;
      debt_to_equity: number;
      eps_ttm: number;
      operating_margin: number;
      net_profit_margin: number;
      revenue_growth_yoy: number;
      profit_growth_yoy: number;
      free_cash_flow: number;
      source: string;
      verified_at: string;
    }>(
      'SELECT * FROM company_fundamentals WHERE asset_id = ?',
      [asset.id]
    );

    if (!f) return null;

    return {
      assetId: asset.id,
      symbol: asset.symbol,
      name: asset.name,
      sector: asset.sector,
      marketCapCr: f.market_cap,
      peRatio: f.pe_ratio,
      pbRatio: f.pb_ratio,
      dividendYield: f.dividend_yield,
      roe: f.roe,
      roce: f.roce,
      debtToEquity: f.debt_to_equity,
      epsTtm: f.eps_ttm,
      operatingMargin: f.operating_margin,
      netProfitMargin: f.net_profit_margin,
      revenueGrowthYoy: f.revenue_growth_yoy,
      profitGrowthYoy: f.profit_growth_yoy,
      freeCashFlowCr: f.free_cash_flow,
      source: f.source,
      verifiedAt: f.verified_at
    };
  }

  getMarketSessionStatus() {
    // Current IST time (UTC + 5:30)
    const now = new Date();
    const utcHours = now.getUTCHours();
    const utcMins = now.getUTCMinutes();
    const istMinutesTotal = (utcHours * 60 + utcMins + 330) % 1440;
    const istHours = Math.floor(istMinutesTotal / 60);
    const istMins = istMinutesTotal % 60;
    const istDay = (now.getUTCDay() + (utcHours * 60 + utcMins + 330 >= 1440 ? 1 : 0)) % 7;

    const isWeekday = istDay >= 1 && istDay <= 5;
    const isPreOpen = isWeekday && istMinutesTotal >= 540 && istMinutesTotal < 555; // 09:00 - 09:15
    const isRegular = isWeekday && istMinutesTotal >= 555 && istMinutesTotal < 930; // 09:15 - 15:30
    const isPostClose = isWeekday && istMinutesTotal >= 930 && istMinutesTotal < 960; // 15:30 - 16:00

    const timeStr = `${String(istHours).padStart(2, '0')}:${String(istMins).padStart(2, '0')} IST`;

    let session: 'PRE_OPEN' | 'REGULAR' | 'POST_CLOSE' | 'CLOSED' = 'CLOSED';
    let message = 'National Stock Exchange (NSE) is currently closed. Weekend / After-hours.';

    if (isRegular) {
      session = 'REGULAR';
      message = 'NSE regular trading session active. Continuous equity auction in progress.';
    } else if (isPreOpen) {
      session = 'PRE_OPEN';
      message = 'NSE pre-open discovery session active.';
    } else if (isPostClose) {
      session = 'POST_CLOSE';
      message = 'NSE post-closing session in progress.';
    }

    return {
      isOpen: isRegular,
      exchange: 'NSE India',
      session,
      nextOpenIST: '09:15 IST (Next regular session)',
      currentTimeIST: timeStr,
      message
    };
  }
}

export const marketData = new MarketDataService();
export default marketData;
