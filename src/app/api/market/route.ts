import { NextResponse } from 'next/server';
import marketData from '@/lib/market-data';
import db from '@/db';
import { requireAuth } from '@/lib/auth/guard';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = requireAuth(request);
  if (!auth.ok) return auth.response;
  const userId = auth.value.id;

  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol');

  const session = marketData.getMarketSessionStatus();

  if (symbol) {
    const quote = await marketData.getQuote(symbol);
    const fundamentals = await marketData.getFundamentals(symbol);
    const candles = await marketData.getHistoricalCandles(symbol, 30);
    const news = db.query(
      `SELECT n.* FROM news_items n 
       JOIN assets a ON n.asset_id = a.id 
       WHERE a.symbol = ? 
       ORDER BY n.published_at DESC LIMIT 5`,
      [symbol.toUpperCase()]
    );

    return NextResponse.json({
      quote,
      fundamentals,
      candles,
      news,
      session
    });
  }

  const quotes = await marketData.getAllQuotes();
  const news = db.query('SELECT * FROM news_items ORDER BY published_at DESC LIMIT 10');
  const watchlists = db.query(`
    SELECT w.*,
      (SELECT COUNT(*) FROM watchlist_items WHERE watchlist_id = w.id) as item_count
    FROM watchlists w
    WHERE w.user_id = ?
  `, [userId]);

  return NextResponse.json({
    quotes,
    news,
    watchlists,
    session
  });
}
