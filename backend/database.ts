import sqlite3 from 'sqlite3';

// Create a new database instance or open an existing one
const db = new sqlite3.Database('./htlc.db', sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err: Error | null) => {
  if (err) {
    console.error(err.message);
  } else {
    console.log('Connected to the htlc database.');
    createTable();
  }
});

// Function to create the offers table
function createTable(): void {
  db.run(`CREATE TABLE IF NOT EXISTS offers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fromuser TEXT NOT NULL,
    touser TEXT,
    status INTEGER DEFAULT 0,
    walletfrom TEXT NOT NULL,
    walletto TEXT,
    amountfrom REAL NOT NULL,
    amountto REAL NOT NULL,
    networkfrom TEXT NOT NULL,
    networkto TEXT NOT NULL,
    fromtoken TEXT, -- Added
    totoken TEXT,   -- Added
    startedat DATETIME DEFAULT CURRENT_TIMESTAMP,
    privatekey TEXT
  )`, (err: Error | null) => {
    if (err) {
      console.error('Error creating table:', err.message);
    } else {
      console.log('Table "offers" created or already exists. New columns fromtoken and totoken might have been added if table already existed.');
      // Note: ALTER TABLE ADD COLUMN is idempotent if the column already exists in newer SQLite versions.
      // For older SQLite, this might need more careful handling for existing tables.
      // We can add them explicitly to be safe for existing tables.
      db.run(`ALTER TABLE offers ADD COLUMN fromtoken TEXT`, () => {/*ignore error if already exists*/});
      db.run(`ALTER TABLE offers ADD COLUMN totoken TEXT`, () => {/*ignore error if already exists*/});
    }
  });
}

export default db;