/**
 * MT5 Trade History Report Parser
 * Parses Excel (.xlsx) exports from MetaTrader 5
 */

import * as XLSX from 'xlsx';

export interface MT5Position {
  openTime: string;
  closeTime: string;
  positionId: string;
  symbol: string;
  type: 'buy' | 'sell';
  volume: number;
  entryPrice: number;
  sl: number | null;
  tp: number | null;
  exitPrice: number;
  commission: number;
  swap: number;
  profit: number;
}

export interface MT5Deal {
  time: string;
  symbol: string;
  dealType: string;
  direction: string;
  volume: number;
  price: number;
  profit: number;
  balance: number;
  comment: string;
}

export interface MT5AccountInfo {
  name: string;
  accountNumber: string;
  server: string;
  accountType: 'demo' | 'real';
  isCent: boolean;
  company: string;
  reportDate: string;
}

export interface MT5ParseResult {
  account: MT5AccountInfo;
  positions: MT5Position[];
  deals: MT5Deal[];
  reportedBalance: number;
  totalNetProfit: number;
  totalTrades: number;
}

function cleanNumber(val: any): number {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return val;
  // Handle formatted numbers like "4 779.368" or "26 687.87"
  const str = String(val).replace(/\s/g, '').replace(',', '.');
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

function cleanString(val: any): string {
  if (val === null || val === undefined) return '';
  return String(val).trim();
}

function parseDateTime(val: any): string {
  if (!val) return '';
  const str = cleanString(val);
  // MT5 format: "2026.04.20 12:33:59" -> "2026-04-20 12:33:59"
  return str.replace(/\./g, '-').replace(/(\d{4})-(\d{2})-(\d{2})/, '$1-$2-$3');
}

export function parseMT5Report(buffer: Buffer): MT5ParseResult {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  
  // Convert to array of arrays for easier parsing
  const data: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  
  // Parse account info from header
  const account = parseAccountInfo(data);
  
  // Find section boundaries
  const positionsStart = findSectionStart(data, 'Positions');
  const ordersStart = findSectionStart(data, 'Orders');
  const dealsStart = findSectionStart(data, 'Deals');
  
  // Parse positions
  const positions = parsePositions(data, positionsStart, ordersStart > 0 ? ordersStart : dealsStart);
  
  // Parse deals
  const deals = parseDeals(data, dealsStart);
  
  // Extract reported balance
  const reportedBalance = extractBalance(data);
  const totalNetProfit = extractNetProfit(data);
  
  return {
    account,
    positions,
    deals,
    reportedBalance,
    totalNetProfit,
    totalTrades: positions.length,
  };
}

function parseAccountInfo(data: any[][]): MT5AccountInfo {
  let name = '';
  let accountNumber = '';
  let server = '';
  let accountType: 'demo' | 'real' = 'demo';
  let isCent = false;
  let company = '';
  let reportDate = '';
  
  for (let i = 0; i < Math.min(10, data.length); i++) {
    const row = data[i];
    if (!row) continue;
    
    const firstCell = cleanString(row[0]);
    const secondCell = cleanString(row[1]);
    const thirdCell = cleanString(row[2]);
    const fourthCell = cleanString(row[3]);
    
    if (firstCell === 'Name:' || secondCell === 'Name:') {
      name = cleanString(row[3] || row[2] || '');
    }
    
    if (firstCell === 'Account:' || secondCell === 'Account:') {
      const acctStr = cleanString(row[3] || row[2] || '');
      // Parse "435513278 (USD, Exness-MT5Trial9, demo, Hedge)"
      const match = acctStr.match(/(\d+)\s*\(([^)]+)\)/);
      if (match) {
        accountNumber = match[1];
        const parts = match[2].split(',').map((s: string) => s.trim().toLowerCase());
        server = parts[1] || '';
        accountType = parts.some((p: string) => p === 'demo' || p.includes('trial')) ? 'demo' : 'real';
        isCent = name.toLowerCase().includes('cent') || parts.some((p: string) => p.includes('cent'));
      } else {
        // Try just extracting the number
        const numMatch = acctStr.match(/(\d+)/);
        if (numMatch) accountNumber = numMatch[1];
      }
    }
    
    if (firstCell === 'Company:' || secondCell === 'Company:') {
      company = cleanString(row[3] || row[2] || '');
    }
    
    if (firstCell === 'Date:' || secondCell === 'Date:') {
      reportDate = cleanString(row[3] || row[2] || '');
    }
  }
  
  return { name, accountNumber, server, accountType, isCent, company, reportDate };
}

function findSectionStart(data: any[][], sectionName: string): number {
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (!row) continue;
    const firstCell = cleanString(row[0]);
    if (firstCell === sectionName) return i;
  }
  return -1;
}

function getSLValue(row: any[], colMap: { [key: string]: number }): number | null {
  const keys = ['S / L', 'S/L', 'SL', 'S /L', 'S/ L'];
  for (const k of keys) {
    if (colMap[k] !== undefined && row[colMap[k]]) {
      const val = cleanNumber(row[colMap[k]]);
      return val !== 0 ? val : null;
    }
  }
  return null;
}

function getTPValue(row: any[], colMap: { [key: string]: number }): number | null {
  const keys = ['T / P', 'T/P', 'TP', 'T /P', 'T/ P'];
  for (const k of keys) {
    if (colMap[k] !== undefined && row[colMap[k]]) {
      const val = cleanNumber(row[colMap[k]]);
      return val !== 0 ? val : null;
    }
  }
  return null;
}

function parsePositions(data: any[][], startIdx: number, endIdx: number): MT5Position[] {
  if (startIdx < 0) return [];
  
  const positions: MT5Position[] = [];
  // Header row is startIdx + 1 (or startIdx itself contains "Positions" then next row is headers)
  // Find the header row with "Time", "Position", "Symbol", etc.
  let headerIdx = startIdx;
  for (let i = startIdx; i < Math.min(startIdx + 3, data.length); i++) {
    const row = data[i];
    if (row && row.some((cell: any) => cleanString(cell) === 'Time') && row.some((cell: any) => cleanString(cell) === 'Position')) {
      headerIdx = i;
      break;
    }
  }
  
  // Map column indices
  const headerRow = data[headerIdx];
  const colMap: { [key: string]: number } = {};
  headerRow.forEach((cell: any, idx: number) => {
    const name = cleanString(cell);
    if (name) {
      // Handle duplicate "Time" and "Price" columns (open vs close)
      if (name === 'Time' && colMap['Time'] !== undefined) {
        colMap['CloseTime'] = idx;
      } else if (name === 'Price' && colMap['Price'] !== undefined) {
        colMap['ClosePrice'] = idx;
      } else {
        colMap[name] = idx;
      }
    }
  });
  
  // Parse data rows
  const actualEnd = endIdx > 0 ? endIdx : data.length;
  for (let i = headerIdx + 1; i < actualEnd; i++) {
    const row = data[i];
    if (!row || !row[colMap['Time']]) continue;
    
    const timeStr = cleanString(row[colMap['Time']]);
    if (!timeStr || timeStr === 'Orders' || timeStr === 'Deals') break;
    
    // Skip non-data rows
    if (!timeStr.match(/\d{4}/)) continue;
    
    const positionId = cleanString(row[colMap['Position']]);
    if (!positionId) continue;
    
    const symbol = cleanString(row[colMap['Symbol']]);
    const typeStr = cleanString(row[colMap['Type']]).toLowerCase();
    if (typeStr !== 'buy' && typeStr !== 'sell') continue;
    
    const position: MT5Position = {
      openTime: parseDateTime(row[colMap['Time']]),
      closeTime: parseDateTime(row[colMap['CloseTime']]),
      positionId,
      symbol,
      type: typeStr as 'buy' | 'sell',
      volume: cleanNumber(row[colMap['Volume']]),
      entryPrice: cleanNumber(row[colMap['Price']]),
      sl: getSLValue(row, colMap),
      tp: getTPValue(row, colMap),
      exitPrice: cleanNumber(row[colMap['ClosePrice']]),
      commission: cleanNumber(row[colMap['Commission']]),
      swap: cleanNumber(row[colMap['Swap']]),
      profit: cleanNumber(row[colMap['Profit']]),
    };
    
    // Validate — must have open/close times and a position ID
    if (position.openTime && position.closeTime && position.positionId) {
      positions.push(position);
    }
  }
  
  return positions;
}

function parseDeals(data: any[][], startIdx: number): MT5Deal[] {
  if (startIdx < 0) return [];
  
  const deals: MT5Deal[] = [];
  let headerIdx = startIdx;
  for (let i = startIdx; i < Math.min(startIdx + 3, data.length); i++) {
    const row = data[i];
    if (row && row.some((cell: any) => cleanString(cell) === 'Deal') && row.some((cell: any) => cleanString(cell) === 'Balance')) {
      headerIdx = i;
      break;
    }
  }
  
  const headerRow = data[headerIdx];
  const colMap: { [key: string]: number } = {};
  headerRow.forEach((cell: any, idx: number) => {
    const name = cleanString(cell);
    if (name) colMap[name] = idx;
  });
  
  for (let i = headerIdx + 1; i < data.length; i++) {
    const row = data[i];
    if (!row || !row[colMap['Time']]) continue;
    
    const timeStr = cleanString(row[colMap['Time']]);
    if (!timeStr || !timeStr.match(/\d{4}/)) {
      // Check if this is the summary row
      if (row.some((cell: any) => cleanString(cell).includes('Balance:'))) break;
      continue;
    }
    
    const deal: MT5Deal = {
      time: parseDateTime(row[colMap['Time']]),
      symbol: cleanString(row[colMap['Symbol']]),
      dealType: cleanString(row[colMap['Type']]).toLowerCase(),
      direction: cleanString(row[colMap['Direction']]).toLowerCase(),
      volume: cleanNumber(row[colMap['Volume']]),
      price: cleanNumber(row[colMap['Price']]),
      profit: cleanNumber(row[colMap['Profit']]),
      balance: cleanNumber(row[colMap['Balance']]),
      comment: cleanString(row[colMap['Comment']]),
    };
    
    // Balance deals have no symbol
    if (!deal.symbol && deal.profit !== 0) {
      deal.dealType = 'balance';
    }
    
    deals.push(deal);
  }
  
  return deals;
}

function extractBalance(data: any[][]): number {
  for (let i = data.length - 1; i >= 0; i--) {
    const row = data[i];
    if (!row) continue;
    for (let j = 0; j < row.length; j++) {
      if (cleanString(row[j]) === 'Balance:') {
        // Balance value is usually in the next column or a few columns over
        for (let k = j + 1; k < Math.min(j + 5, row.length); k++) {
          const val = cleanNumber(row[k]);
          if (val > 0) return val;
        }
      }
    }
  }
  return 0;
}

function extractNetProfit(data: any[][]): number {
  for (let i = data.length - 1; i >= 0; i--) {
    const row = data[i];
    if (!row) continue;
    for (let j = 0; j < row.length; j++) {
      if (cleanString(row[j]) === 'Total Net Profit:') {
        for (let k = j + 1; k < Math.min(j + 5, row.length); k++) {
          const val = cleanNumber(row[k]);
          if (val !== 0) return val;
        }
      }
    }
  }
  return 0;
}
