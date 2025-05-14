import express, { Router, Request, Response } from 'express';
import db from '../database'; 
import sqlite3 from 'sqlite3';

const router: Router = express.Router();

interface Offer {
  id?: number;
  status?: number;
  amountfrom: number;
  amountto: number;
  networkfrom: string;
  networkto: string;
  fromtoken?: string | null;
  totoken?: string | null;
  
  creator_ton_address: string;
  creator_stellar_address: string;
  taker_ton_address?: string | null;
  taker_stellar_address?: string | null;
  
  privatekey?: string | null;
  startedat?: string; 

  ton_htlc_address_user_a?: string | null;
  ton_htlc_address_user_b?: string | null;
  stellar_htlc_address_user_a?: string | null;
  stellar_htlc_address_user_b?: string | null;
}

// POST /api/offers - Create a new offer
router.post('/', (req: Request, res: Response) => {
  const {
    amountfrom, amountto, 
    networkfrom, networkto, 
    fromtoken, totoken, 
    creator_ton_address,
    creator_stellar_address
  }: Offer = req.body;

  if (
    !amountfrom || !amountto || 
    !networkfrom || !networkto || 
    !fromtoken || !totoken ||
    !creator_ton_address || !creator_stellar_address
  ) {
    return res.status(400).json({ error: 'Missing required fields. Ensure amounts, networks, tokens, and creator TON/Stellar addresses are provided.' });
  }

  const sql = `INSERT INTO offers (
    amountfrom, amountto, networkfrom, networkto, fromtoken, totoken, 
    creator_ton_address, creator_stellar_address, status
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`;
  const params = [
    amountfrom, amountto, networkfrom, networkto, fromtoken, totoken,
    creator_ton_address, creator_stellar_address
  ];

  db.run(sql, params, function(this: sqlite3.RunResult, err: Error | null) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.status(201).json({
      message: 'Offer created successfully',
      offerId: this.lastID
    });
  });
});

// GET /api/offers - Get all offers
router.get('/', (req: Request, res: Response) => {
  const sql = "SELECT * FROM offers ORDER BY startedat DESC";
  db.all(sql, [], (err: Error | null, rows: Offer[]) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({
      message: "Successfully retrieved all offers",
      data: rows
    });
  });
});

// GET /api/offers/:id - Get a specific offer by ID
router.get('/:id', (req: Request, res: Response) => {
  const sql = "SELECT * FROM offers WHERE id = ?";
  const params = [req.params.id];
  db.get(sql, params, (err: Error | null, row: Offer) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (row) {
      res.json({
        message: "Successfully retrieved the offer",
        data: row
      });
    } else {
      res.status(404).json({ error: `Offer with id ${req.params.id} not found` });
    }
  });
});

// PUT /api/offers/:id/accept - Accept an offer
router.put('/:id/accept', (req: Request, res: Response) => {
  const {
    taker_ton_address, 
    taker_stellar_address, 
    privatekey,
    ton_htlc_address_user_b, // If taker deploys their TON HTLC immediately
    stellar_htlc_address_user_b // If taker deploys their Stellar HTLC immediately
  } = req.body;
  
  if (!taker_ton_address || !taker_stellar_address || !privatekey) {
    return res.status(400).json({ error: 'Missing required fields: taker TON & Stellar addresses, and privatekey.' });
  }

  const sql = `UPDATE offers SET 
    taker_ton_address = ?,
    taker_stellar_address = ?,
    privatekey = ?,
    ton_htlc_address_user_b = ?,
    stellar_htlc_address_user_b = ?,
    status = 1 
    WHERE id = ? AND status = 0`;
    
  const params = [
    taker_ton_address, 
    taker_stellar_address, 
    privatekey, 
    ton_htlc_address_user_b, // Can be null if not deployed yet or not applicable
    stellar_htlc_address_user_b, // Can be null
    req.params.id
  ];

  db.run(sql, params, function(this: sqlite3.RunResult, err: Error | null) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (this.changes > 0) {
      res.json({ message: `Offer ${req.params.id} accepted, status updated to 1.` });
    } else {
      res.status(404).json({ error: `Offer with id ${req.params.id} not found or cannot be accepted.` });
    }
  });
});

// PUT /api/offers/:id/status - Update offer status and potentially other fields like HTLC addresses
router.put('/:id/status', (req: Request, res: Response) => {
  const { status, ...otherDataToUpdate } = req.body;

  if (status === undefined) {
    return res.status(400).json({ error: 'Missing status field' });
  }

  const allowedFieldsToUpdate = [
    'privatekey', 
    'taker_ton_address', 'taker_stellar_address',
    'ton_htlc_address_user_a', 'ton_htlc_address_user_b',
    'stellar_htlc_address_user_a', 'stellar_htlc_address_user_b'
  ];
  
  let setClauses: string[] = ['status = ?'];
  let params: (string | number | null | undefined)[] = [status];

  for (const key in otherDataToUpdate) {
    if (allowedFieldsToUpdate.includes(key) && otherDataToUpdate[key] !== undefined) {
      setClauses.push(`${key} = ?`);
      params.push(otherDataToUpdate[key]);
    }
  }
  params.push(req.params.id); 

  let condition = 'id = ?';
  // Add specific conditions for status transitions if needed, e.g.:
  if (status === 1 && !Object.keys(otherDataToUpdate).some(k => k.startsWith('taker_'))) { 
    // This would be a direct status update to 1 without accepting, generally not what we want.
    // The /accept route is more appropriate for status 1.
    // For now, allow any status update if ID matches and previous status allows.
  } else if (status === 2) condition += ' AND status = 1'; 
  else if (status === 3) condition += ' AND status = 2'; 
  else if (status === 4) condition += ' AND status = 3'; 
  // else if (status === -1) // allow -1 from many states

  const sql = `UPDATE offers SET ${setClauses.join(', ')} WHERE ${condition}`;

  db.run(sql, params, function(this: sqlite3.RunResult, err: Error | null) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (this.changes > 0) {
      res.json({ message: `Offer ${req.params.id} updated successfully.` });
    } else {
      res.status(404).json({ error: `Offer with id ${req.params.id} not found or status/conditions not met for update.` });
    }
  });
});

export default router;
