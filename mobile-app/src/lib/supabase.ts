import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { fetchWithTimeout } from '../utils/fetchTimeout';

const SUPABASE_URL = 'https://sixwgsqfutnvdxhrvkzd.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_0r33KI_abURhBHAd2wlcTw_tUiOMt_2';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  global: {
    fetch: fetchWithTimeout(),
  },
});
