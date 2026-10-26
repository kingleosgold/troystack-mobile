import { supabase } from '../lib/supabase';
import { fetchAllRows, newestFirst } from '../utils/fetchAllRows';
import { idsForFetch } from '../utils/fallbackIds';
import { asRestoredBy, holdingsToUpload, rowEditsToSend } from '../utils/holdingsUpload';
import { insertRows } from '../utils/insertRows';
import { purchaseDateForCloud } from '../utils/purchaseDate';
import { HOLDING_WRITES_WAIT_MS, sendAllWithin } from '../utils/pendingWrites';

// How a sync sends the edits it puts over rows: track starts a row's write
// as one the app waits for, by is the deadline for all of them and stopped
// says the account changed. Without them each write still has the limit.
export interface RowEditWait {
  track?: (rowId: string, run: () => Promise<{ error: any }>) => Promise<{ error: any }>;
  by?: number;
  stopped?: () => boolean;
}

// Local holding structure (from App.js)
export interface LocalHolding {
  id: number;
  productName: string;
  source: string;
  datePurchased: string;
  timePurchased?: string; // Optional: HH:MM format for minute-level spot price lookup
  ozt: number;
  quantity: number;
  unitPrice: number;
  taxes: number;
  shipping: number;
  spotPrice: number;
  premium: number;
  costBasis?: number; // Optional: manually adjusted total cost basis
}

// Supabase holding structure
// Note: Extra fields (local_id, source, taxes, shipping, spot_price, premium) are stored as JSON in notes
export interface SupabaseHolding {
  id: string;
  user_id: string;
  metal: 'silver' | 'gold' | 'platinum' | 'palladium';
  type: string; // productName
  weight: number; // ozt
  weight_unit: string;
  quantity: number;
  purchase_price: number; // unitPrice
  purchase_date: string | null;
  notes: string | null; // JSON string containing extra fields
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// Extra data stored in notes as JSON
interface HoldingNotes {
  local_id?: number;
  source?: string;
  time_purchased?: string; // HH:MM format
  taxes?: number;
  shipping?: number;
  spot_price?: number;
  premium?: number;
  cost_basis?: number;
}

// Convert local holding to Supabase format
export function localToSupabase(
  holding: LocalHolding,
  metal: 'silver' | 'gold' | 'platinum' | 'palladium',
  userId: string
): Omit<SupabaseHolding, 'id' | 'created_at' | 'updated_at' | 'deleted_at'> {
  // Store extra fields in notes as JSON
  const notesData: HoldingNotes = {
    local_id: holding.id,
    source: holding.source || undefined,
    time_purchased: holding.timePurchased || undefined,
    taxes: holding.taxes || undefined,
    shipping: holding.shipping || undefined,
    spot_price: holding.spotPrice || undefined,
    premium: holding.premium || undefined,
    cost_basis: holding.costBasis || undefined,
  };

  return {
    user_id: userId,
    metal,
    type: holding.productName,
    weight: holding.ozt,
    weight_unit: 'oz',
    quantity: holding.quantity,
    purchase_price: holding.unitPrice,
    purchase_date: purchaseDateForCloud(holding.datePurchased),
    notes: JSON.stringify(notesData),
  };
}

// The local_id in a row's notes JSON, if it has one
function localIdOf(holding: SupabaseHolding): number | undefined {
  if (!holding.notes) return undefined;
  try {
    return JSON.parse(holding.notes)?.local_id || undefined;
  } catch (e) {
    return undefined;
  }
}

// Convert Supabase holding to local format
export function supabaseToLocal(holding: SupabaseHolding): LocalHolding {
  // Parse extra fields from notes JSON
  let notesData: HoldingNotes = {};
  if (holding.notes) {
    try {
      notesData = JSON.parse(holding.notes) || {};
    } catch (e) {
      // notes might be plain text, not JSON
      console.warn('Could not parse notes as JSON:', holding.notes);
    }
  }

  return {
    id: notesData.local_id || Date.now(),
    productName: holding.type || '',
    source: notesData.source || '',
    datePurchased: holding.purchase_date || '',
    timePurchased: notesData.time_purchased || '',
    ozt: holding.weight || 0,
    quantity: holding.quantity || 1,
    unitPrice: holding.purchase_price || 0,
    taxes: notesData.taxes || 0,
    shipping: notesData.shipping || 0,
    spotPrice: notesData.spot_price || 0,
    premium: notesData.premium || 0,
    costBasis: notesData.cost_basis,
  };
}

// Fetch all holdings for a user
export async function fetchHoldings(userId: string): Promise<{
  silverItems: LocalHolding[];
  goldItems: LocalHolding[];
  platinumItems: LocalHolding[];
  palladiumItems: LocalHolding[];
  error: Error | null;
}> {
  try {
    // Every page, not just the first 1000 rows. The pages go by id, so the
    // newest first order comes after.
    const { data: rows, error } = await fetchAllRows(() =>
      supabase
        .from('holdings')
        .select('*')
        .eq('user_id', userId)
        .is('deleted_at', null)
    );

    if (error) throw error;
    const data = newestFirst(rows || []);

    const silverItems: LocalHolding[] = [];
    const goldItems: LocalHolding[] = [];
    const platinumItems: LocalHolding[] = [];
    const palladiumItems: LocalHolding[] = [];

    // A row with no local_id, or one repeating another row's, gets an id no
    // other row in this fetch has
    const ids = idsForFetch((data || []).map(localIdOf), Date.now());

    (data || []).forEach((holding: SupabaseHolding, i: number) => {
      const localHolding = supabaseToLocal(holding);
      localHolding.id = ids[i];
      // Attach supabase_id for future updates
      (localHolding as any).supabase_id = holding.id;

      if (holding.metal === 'silver') {
        silverItems.push(localHolding);
      } else if (holding.metal === 'gold') {
        goldItems.push(localHolding);
      } else if (holding.metal === 'platinum') {
        platinumItems.push(localHolding);
      } else if (holding.metal === 'palladium') {
        palladiumItems.push(localHolding);
      }
    });

    return { silverItems, goldItems, platinumItems, palladiumItems, error: null };
  } catch (err) {
    console.error('Error fetching holdings:', err);
    return { silverItems: [], goldItems: [], platinumItems: [], palladiumItems: [], error: err as Error };
  }
}

// Add a new holding
export async function addHolding(
  userId: string,
  holding: LocalHolding,
  metal: 'silver' | 'gold' | 'platinum' | 'palladium'
): Promise<{ data: SupabaseHolding | null; error: Error | null }> {
  try {
    const supabaseHolding = localToSupabase(holding, metal, userId);

    const { data, error } = await supabase
      .from('holdings')
      .insert(supabaseHolding)
      .select()
      .single();

    if (error) throw error;

    return { data, error: null };
  } catch (err) {
    console.error('Error adding holding:', err);
    return { data: null, error: err as Error };
  }
}

// Update an existing holding. The row must also be this account's, so a write
// made for one account never lands on another's row
export async function updateHolding(
  userId: string,
  supabaseId: string,
  holding: LocalHolding,
  metal: 'silver' | 'gold' | 'platinum' | 'palladium'
): Promise<{ data: SupabaseHolding | null; error: Error | null }> {
  try {
    // Store extra fields in notes as JSON
    const notesData: HoldingNotes = {
      local_id: holding.id,
      source: holding.source || undefined,
      time_purchased: holding.timePurchased || undefined,
      taxes: holding.taxes || undefined,
      shipping: holding.shipping || undefined,
      spot_price: holding.spotPrice || undefined,
      premium: holding.premium || undefined,
      cost_basis: holding.costBasis || undefined,
    };

    const updateData = {
      type: holding.productName,
      weight: holding.ozt,
      quantity: holding.quantity,
      purchase_price: holding.unitPrice,
      purchase_date: purchaseDateForCloud(holding.datePurchased),
      metal,
      notes: JSON.stringify(notesData),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('holdings')
      .update(updateData)
      .eq('id', supabaseId)
      .eq('user_id', userId)
      // A row another device deleted stays as it was deleted, and the edit
      // reads back as no row rather than as saved
      .is('deleted_at', null)
      .select()
      .single();

    if (error) throw error;

    return { data, error: null };
  } catch (err) {
    console.error('Error updating holding:', err);
    return { data: null, error: err as Error };
  }
}

// Soft delete a holding, only if it's this account's row
export async function deleteHolding(
  userId: string,
  supabaseId: string
): Promise<{ error: Error | null }> {
  try {
    const { error } = await supabase
      .from('holdings')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', supabaseId)
      .eq('user_id', userId);

    if (error) throw error;

    return { error: null };
  } catch (err) {
    console.error('Error deleting holding:', err);
    return { error: err as Error };
  }
}

// Find holding by local_id in notes JSON. A failed read throws rather than
// return null, since null means not in the cloud: an edit would add the
// holding a second time, and a delete would skip a row that's there.
export async function findHoldingByLocalId(
  userId: string,
  localId: number,
  metal: 'silver' | 'gold' | 'platinum' | 'palladium'
): Promise<SupabaseHolding | null> {
  try {
    // One read finds a row that was already there. Reading until the stack
    // settles could end in an error that reads as not found, and the edit
    // would upload the holding again.
    const { data, error } = await fetchAllRows(() =>
      supabase
        .from('holdings')
        .select('*')
        .eq('user_id', userId)
        .eq('metal', metal)
        .is('deleted_at', null),
      undefined,
      { settle: false }
    );

    if (error) throw error;

    // Search for matching local_id in notes JSON
    const match = (data || []).find((h: SupabaseHolding) => {
      if (!h.notes) return false;
      try {
        const notesData = JSON.parse(h.notes);
        return notesData.local_id === localId;
      } catch (e) {
        return false;
      }
    });

    return match || null;
  } catch (err) {
    console.error('Error finding holding by local ID:', err);
    throw err;
  }
}

// Sync local holdings to Supabase (for first-time migration)
export async function syncLocalToSupabase(
  userId: string,
  silverItems: LocalHolding[],
  goldItems: LocalHolding[],
  platinumItems: LocalHolding[] = [],
  palladiumItems: LocalHolding[] = [],
  rowEditWait: RowEditWait = {}
): Promise<{
  syncedCount: number;
  skippedCount: number;
  rejected: { item: LocalHolding; metal: 'silver' | 'gold' | 'platinum' | 'palladium'; rowId?: string }[];
  unsentRows: { item: LocalHolding; metal: 'silver' | 'gold' | 'platinum' | 'palladium'; rowId?: string }[];
  error: Error | null;
}> {
  let syncedCount = 0;
  let skippedCount = 0;
  const rejected: { item: LocalHolding; metal: 'silver' | 'gold' | 'platinum' | 'palladium'; rowId?: string }[] = [];

  try {
    // Get existing holdings to avoid duplicates, deleted ones included so a
    // holding this account deleted doesn't come back from an old copy
    const { data: existingHoldings, error: fetchError } = await fetchAllRows(() =>
      supabase
        .from('holdings')
        .select('id, notes, deleted_at, created_at')
        .eq('user_id', userId)
    );

    if (fetchError) throw fetchError;

    // This account's row ids and their local_ids (stored in notes JSON),
    // deleted rows included
    const existingRowIds = new Set<string>();
    const existingLocalIds = new Set<number>();
    // The live rows by local_id, for edits whose lookup failed
    const liveRows = new Map<number, string>();
    (existingHoldings || []).forEach((h: any) => {
      existingRowIds.add(h.id);
      if (h.notes) {
        try {
          const notesData = JSON.parse(h.notes);
          if (notesData.local_id) {
            existingLocalIds.add(notesData.local_id);
            if (!h.deleted_at) liveRows.set(notesData.local_id, h.id);
          }
        } catch (e) {
          // Ignore parse errors
        }
      }
    });

    // Prepare holdings to insert, with the local holding each row came from
    const holdingsToInsert: any[] = [];
    const sources: { item: LocalHolding; metal: 'silver' | 'gold' | 'platinum' | 'palladium' }[] = [];

    const metalGroups: { items: LocalHolding[]; metal: 'silver' | 'gold' | 'platinum' | 'palladium' }[] = [
      { items: silverItems, metal: 'silver' },
      { items: goldItems, metal: 'gold' },
      { items: platinumItems, metal: 'platinum' },
      { items: palladiumItems, metal: 'palladium' },
    ];

    // An edit whose lookup failed goes over the row it was looking for,
    // which the insert below skips. One that fails stays on the phone
    // instead of its row, marked, like a refused insert, so it can't hold
    // back every sync. The sync waits for these writes only so long, as for
    // its other resends, and one it lets go of stays marked the same way.
    type RowEdit = { item: LocalHolding; rowId: string; metal: 'silver' | 'gold' | 'platinum' | 'palladium' };
    const rowEdits: RowEdit[] = metalGroups.flatMap(({ items, metal }) => rowEditsToSend(items, liveRows, userId)
      .map(({ item, rowId }: { item: LocalHolding; rowId: string }) => ({ item, rowId, metal })));
    const track = rowEditWait.track || ((_rowId: string, run: () => Promise<{ error: any }>) => run());
    const unsentRowEdits: RowEdit[] = await sendAllWithin(
      rowEdits,
      ({ item, rowId, metal }: RowEdit) => track(rowId, () => updateHolding(userId, rowId, item, metal)),
      rowEditWait.by ?? Date.now() + HOLDING_WRITES_WAIT_MS,
      rowEditWait.stopped
    );
    // Kept apart from refusals, since a row edit that didn't land is most
    // likely a bad connection, not numbers the database turned down
    const unsentRows = unsentRowEdits.map(({ item, rowId, metal }) => ({ item, metal, rowId }));

    for (const { items, metal } of metalGroups) {
      const toUpload = holdingsToUpload(items, existingLocalIds, existingRowIds);
      skippedCount += items.length - toUpload.length;
      for (const item of toUpload) {
        holdingsToInsert.push(localToSupabase(item, metal, userId));
        sources.push({ item, metal });
      }
    }

    // Batch insert, row by row if the database refuses the batch over one
    // row's data, so that row can't hold back every later sync
    const { insertedCount, rejected: rejectedRows, error: insertError } = await insertRows(
      holdingsToInsert,
      async (rows: any[]) => supabase.from('holdings').insert(rows)
    );
    syncedCount = insertedCount;
    if (insertError) throw insertError;
    rejectedRows.forEach((index: number) => rejected.push(sources[index]));
    if (rejected.length) console.warn(`Supabase refused ${rejected.length} holding(s); they stay on the phone`);

    return { syncedCount, skippedCount, rejected, unsentRows, error: null };
  } catch (err) {
    console.error('Error syncing local to Supabase:', err);
    return { syncedCount, skippedCount, rejected: [], unsentRows: [], error: err as Error };
  }
}

// Full sync: Supabase is source of truth when signed in
// With uploadLocal it first uploads the local holdings App.js picked for this
// account (src/utils/holdingsUpload.js), and syncLocalToSupabase skips any the
// cloud already has.
export async function fullSync(
  userId: string,
  localSilver: LocalHolding[],
  localGold: LocalHolding[],
  uploadLocal: boolean = false,
  localPlatinum: LocalHolding[] = [],
  localPalladium: LocalHolding[] = [],
  rowEditWait: RowEditWait = {}
): Promise<{
  silverItems: LocalHolding[];
  goldItems: LocalHolding[];
  platinumItems: LocalHolding[];
  palladiumItems: LocalHolding[];
  syncedToCloud: number;
  refusedCount: number;
  refusedNames: string[];
  // Row edits the sync couldn't send, put back marked like a refusal
  unsentRowEdits: number;
  error: Error | null;
}> {
  try {
    // First, fetch what's in Supabase (source of truth)
    const { silverItems: remoteSilver, goldItems: remoteGold, platinumItems: remotePlatinum, palladiumItems: remotePalladium, error: fetchError } = await fetchHoldings(userId);

    if (fetchError) throw fetchError;

    const hasRemoteData = remoteSilver.length > 0 || remoteGold.length > 0 || remotePlatinum.length > 0 || remotePalladium.length > 0;
    const hasLocalData = localSilver.length > 0 || localGold.length > 0 || localPlatinum.length > 0 || localPalladium.length > 0;

    // Add the local holdings App.js picked for this account (src/utils/
    // holdingsUpload.js), whether or not it already has some, so a guest who
    // signs in keeps their stack
    let syncedCount = 0;
    if (uploadLocal && hasLocalData) {
      console.log(`Adding local holdings (cloud ${hasRemoteData ? 'has holdings' : 'empty'})...`);
      const { syncedCount: uploaded, rejected, unsentRows, error: syncError } = await syncLocalToSupabase(
        userId,
        localSilver,
        localGold,
        localPlatinum,
        localPalladium,
        rowEditWait
      );

      // A failed upload keeps the local stack on screen and this sync unmarked,
      // so the holdings aren't replaced by the cloud's and a later sync retries
      if (syncError) throw syncError;
      syncedCount = uploaded;
      // Re-fetch after migration to get the items with supabase_ids. If that
      // fails, the error keeps the local stack on screen instead of empty lists.
      const { silverItems: newSilver, goldItems: newGold, platinumItems: newPlatinum, palladiumItems: newPalladium, error: refetchError } = await fetchHoldings(userId);
      if (refetchError) throw refetchError;
      // A holding the database refused stays on the phone beside the cloud's
      // copy, marked for this account so the next sync tries it again
      // A failed edit of a row takes the row's place, in its own metal's list
      // and so does one that didn't land
      const putBack = [...rejected, ...unsentRows];
      const editedRows = new Set(putBack.map(({ rowId }) => rowId).filter(Boolean));
      const withoutEdited = (items: LocalHolding[]) => items.filter((h) => !editedRows.has((h as any).supabase_id));
      const lists = { silver: withoutEdited(newSilver), gold: withoutEdited(newGold), platinum: withoutEdited(newPlatinum), palladium: withoutEdited(newPalladium) };
      // and a failed edit keeps its lookup mark, so the next sync sends it
      // again, and the row it found, so a delete or edit before then reaches
      // that row even when the edit moved the holding to another metal
      putBack.forEach(({ item, metal, rowId }) => lists[metal].push(...asRestoredBy([item], userId)
        .map((back) => (rowId ? { ...back, supabase_id: rowId, rowLookupFor: userId } : back))));
      return {
        silverItems: lists.silver,
        goldItems: lists.gold,
        platinumItems: lists.platinum,
        palladiumItems: lists.palladium,
        syncedToCloud: syncedCount,
        refusedCount: rejected.length,
        refusedNames: rejected.map(({ item }) => item.productName),
        unsentRowEdits: unsentRows.length,
        error: null,
      };
    }

    // Return Supabase holdings as source of truth
    // This REPLACES local holdings, not merges
    return {
      silverItems: remoteSilver,
      goldItems: remoteGold,
      platinumItems: remotePlatinum,
      palladiumItems: remotePalladium,
      syncedToCloud: syncedCount,
      refusedCount: 0,
      refusedNames: [],
      unsentRowEdits: 0,
      error: null,
    };
  } catch (err) {
    console.error('Error in full sync:', err);
    return {
      silverItems: localSilver,
      goldItems: localGold,
      platinumItems: localPlatinum,
      palladiumItems: localPalladium,
      syncedToCloud: 0,
      refusedCount: 0,
      refusedNames: [],
      unsentRowEdits: 0,
      error: err as Error,
    };
  }
}
