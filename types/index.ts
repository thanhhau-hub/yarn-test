// ─────────────────────────────────────────────────────────────
// Shared TypeScript types for the entire app
// These mirror the database tables in Supabase
// ─────────────────────────────────────────────────────────────

/** Represents a physical storage area on the factory floor (e.g. "A1.1") */
export type Area = {
  id: string;
  code: string;       // e.g. "A1.1"
  label: string | null; // e.g. "Rack A, Row 1, Slot 1"
  is_active: boolean;
};

/** A yarn roll (LOT) that is tracked in the system */
export type YarnRoll = {
  id: string;
  yarn_code: string;  // LOT number e.g. "K446", "3310"
  area_id: string | null;   // null = not on the floor
  status: 'in_stock' | 'retrieved' | 'consumed';
  updated_at: string;

  // Joined fields (when fetched with area data)
  areas?: Area;
};

/** A single movement event recorded whenever a yarn roll is moved */
export type MoveLog = {
  id: string;
  yarn_roll_id: string | null;
  from_area_id: string | null;
  to_area_id: string | null;
  moved_by: string | null;     // user id from auth.users
  moved_at: string;
  note: string | null;
  action: 'CREATE' | 'MOVE' | 'EDIT' | 'DELETE' | 'ROLE_CHANGE' | 'AREA_CREATE' | 'AREA_DISABLE' | 'AREA_ENABLE' | null;
  yarn_code: string | null;
  from_area_code: string | null;
  to_area_code: string | null;
};

/** User profile representation */
export type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: 'worker' | 'supervisor';
  created_at: string;
  updated_at: string;
};

/** Area with a count of yarn rolls inside it (used on the board view) */
export type AreaWithCount = Area & {
  yarn_count: number;
  yarns?: YarnRoll[];
};
