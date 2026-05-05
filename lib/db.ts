import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DATA_DIR = path.join(process.cwd(), "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(path.join(DATA_DIR, "photos"))) {
  fs.mkdirSync(path.join(DATA_DIR, "photos"), { recursive: true });
}

const db = new Database(path.join(DATA_DIR, "eats.db"));
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS meals (
    id TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL,
    photo_filename TEXT,
    items_json TEXT NOT NULL,
    sat_fat_g REAL NOT NULL DEFAULT 0,
    soluble_fiber_g REAL NOT NULL DEFAULT 0,
    calories REAL NOT NULL DEFAULT 0,
    protein_g REAL NOT NULL DEFAULT 0,
    is_plant_based INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    caption TEXT
  );
`);

// Idempotent migration for DBs created before the caption column existed.
try {
  db.exec("ALTER TABLE meals ADD COLUMN caption TEXT");
} catch {
  // column already exists
}

export type Meal = {
  id: string;
  created_at: number;
  photo_filename: string | null;
  items_json: string;
  sat_fat_g: number;
  soluble_fiber_g: number;
  calories: number;
  protein_g: number;
  is_plant_based: number;
  notes: string | null;
  caption: string | null;
};

export function insertMeal(m: Meal) {
  db.prepare(
    `INSERT INTO meals (id, created_at, photo_filename, items_json, sat_fat_g, soluble_fiber_g, calories, protein_g, is_plant_based, notes, caption)
     VALUES (@id, @created_at, @photo_filename, @items_json, @sat_fat_g, @soluble_fiber_g, @calories, @protein_g, @is_plant_based, @notes, @caption)`
  ).run(m);
}

export function deleteMeal(id: string) {
  db.prepare("DELETE FROM meals WHERE id = ?").run(id);
}

export function getMealsBetween(startMs: number, endMs: number): Meal[] {
  return db
    .prepare(
      "SELECT * FROM meals WHERE created_at >= ? AND created_at < ? ORDER BY created_at DESC"
    )
    .all(startMs, endMs) as Meal[];
}

export default db;
