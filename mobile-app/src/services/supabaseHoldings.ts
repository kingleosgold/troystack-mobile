import { supabase } from '../lib/supabase';
import { fetchAllRows, newestFirst } from '../utils/fetchAllRows';
import { asRestoredBy, holdingsToUpload } from '../utils/holdingsUpload';
import { insertRows } from '../utils/insertRows';
import { purchaseDateForCloud } from '../utils/purchaseDate';

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

// Convert Supabase holding to local format
export function supabaseToLocal(holding: SupabaseHolding): LocalHolding {
  // Parse extra fields from notes JSON
  let notesData: HoldingNotes = {};
  if (holding.notes) {
    try {
      notesData = JSON.parse(holding.notes);
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

    (data || []).forEach((holding: SupabaseHolding) => {
      const localHolding = supabaseToLocal(holding);
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

// Update an existing holding
export async function updateHolding(
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
      .select()
      .single();

    if (error) throw error;

    return { data, error: null };
  } catch (err) {
    console.error('Error updating holding:', err);
    return { data: null, error: err as Error };
  }
}

// Soft delete a holding
export async function deleteHolding(
  supabaseId: string
): Promise<{ error: Error | null }> {
  try {
    const { error } = await supabase
      .from('holdings')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', supabaseId);

    if (error) throw error;

    return { error: null };
  } catch (err) {
    console.error('Error deleting holding:', err);
    return { error: err as Error };
  }
}

// Find holding by local_id in notes JSON
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
    return null;
  }
}

// Sync local holdings to Supabase (for first-time migration)
export async function syncLocalToSupabase(
  userId: string,
  silverItems: LocalHolding[],
  goldItems: LocalHolding[],
  platinumItems: LocalHolding[] = [],
  palladiumItems: LocalHolding[] = []
): Promise<{
  syncedCount: number;
  skippedCount: number;
  rejected: { item: LocalHolding; metal: 'silver' | 'gold' | 'platinum' | 'palladium' }[];
  error: Error | null;
}> {
  let syncedCount = 0;
  let skippedCount = 0;
  const rejected: { item: LocalHolding; metal: 'silver' | 'gold' | 'platinum' | 'palladium' }[] = [];

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
    (existingHoldings || []).forEach((h: any) => {
      existingRowIds.add(h.id);
      if (h.notes) {
        try {
          const notesData = JSON.parse(h.notes);
          if (notesData.local_id) {
            existingLocalIds.add(notesData.local_id);
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

    return { syncedCount, skippedCount, rejected, error: null };
  } catch (err) {
    console.error('Error syncing local to Supabase:', err);
    return { syncedCount, skippedCount, rejected: [], error: err as Error };
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
  localPalladium: LocalHolding[] = []
): Promise<{
  silverItems: LocalHolding[];
  goldItems: LocalHolding[];
  platinumItems: LocalHolding[];
  palladiumItems: LocalHolding[];
  syncedToCloud: number;
  refusedCount: number;
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
      const { syncedCount: uploaded, rejected, error: syncError } = await syncLocalToSupabase(
        userId,
        localSilver,
        localGold,
        localPlatinum,
        localPalladium
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
      const lists = { silver: newSilver, gold: newGold, platinum: newPlatinum, palladium: newPalladium };
      rejected.forEach(({ item, metal }) => lists[metal].push(...asRestoredBy([item], userId)));
      return {
        silverItems: newSilver,
        goldItems: newGold,
        platinumItems: newPlatinum,
        palladiumItems: newPalladium,
        syncedToCloud: syncedCount,
        refusedCount: rejected.length,
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
      error: err as Error,
    };
  }
}
