import express, { Router, Request, Response } from 'express';
import db from '../database'; // Adjust path as necessary
import sqlite3 from 'sqlite3'; // Import sqlite3 for RunResult type

const router: Router = express.Router();

interface Offer {
  id?: number;
  fromuser: string;
  touser?: string | null;
  status?: number;
  walletfrom: string;
  walletto?: string | null;
  amountfrom: number;
  amountto: number;
  networkfrom: string;
  networkto: string;
  fromtoken?: string | null; // Added
  totoken?: string | null;   // Added
  startedat?: string; // Or Date, depending on how you want to handle it
  privatekey?: string | null;
}

// POST /api/offers - Create a new offer
router.post('/', (req: Request, res: Response) => {
  const { 
    fromuser, walletfrom, 
    amountfrom, amountto, 
    networkfrom, networkto, 
    fromtoken, totoken // Added
  }: Offer = req.body;

  // Basic validation
  if (!fromuser || !walletfrom || !amountfrom || !amountto || !networkfrom || !networkto || !fromtoken || !totoken) {
    return res.status(400).json({ error: 'Missing required fields. Ensure fromtoken and totoken are provided.' });
  }

  const sql = `INSERT INTO offers (fromuser, walletfrom, amountfrom, amountto, networkfrom, networkto, fromtoken, totoken, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`;
  const params = [fromuser, walletfrom, amountfrom, amountto, networkfrom, networkto, fromtoken, totoken];

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
  const sql = "SELECT * FROM offers";
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
  const { touser, walletto, privatekey } = req.body;
  if (!touser || !walletto || !privatekey) {
    return res.status(400).json({ error: 'Missing required fields for accepting offer' });
  }

  const sql = `UPDATE offers SET touser = ?, walletto = ?, privatekey = ?, status = 1 WHERE id = ? AND status = 0`;
  const params = [touser, walletto, privatekey, req.params.id];

  db.run(sql, params, function(this: sqlite3.RunResult, err: Error | null) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (this.changes > 0) {
      res.json({ message: `Offer ${req.params.id} accepted and status updated to 1` });
    } else {
      res.status(404).json({ error: `Offer with id ${req.params.id} not found or cannot be accepted (already accepted or in a different status).` });
    }
  });
});

// PUT /api/offers/:id/status - Update offer status
router.put('/:id/status', (req: Request, res: Response) => {
  const { status, privatekey } = req.body; // privatekey is optional, only needed for specific status changes

  if (status === undefined) {
    return res.status(400).json({ error: 'Missing status field' });
  }

  let sql: string;
  let params: (string | number | undefined)[];

  if (status === 2) {
    sql = `UPDATE offers SET status = ? WHERE id = ? AND status = 1`;
    params = [status, req.params.id];
  } else if (status === 3 || status === 4 || status === -1) {
    sql = `UPDATE offers SET status = ? WHERE id = ?`;
    params = [status, req.params.id];
  } else {
    return res.status(400).json({ error: 'Invalid status value' });
  }

  db.run(sql, params, function(this: sqlite3.RunResult, err: Error | null) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (this.changes > 0) {
      res.json({ message: `Offer ${req.params.id} status updated to ${status}` });
    } else {
      res.status(404).json({ error: `Offer with id ${req.params.id} not found or status cannot be updated to ${status} from current state.` });
    }
  });
});

export default router;
