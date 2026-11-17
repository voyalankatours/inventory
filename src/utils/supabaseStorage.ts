import { isSupabaseConfigured, supabase } from '../lib/supabase';
import {
  ActivityAction,
  ActivityEntityType,
  ActivityLog,
  CompanyDetails,
  CustomerDetails,
  CustomerRecord,
  DEFAULT_COMPANY,
  DEFAULT_ENTRANCE_TICKETS,
  DEFAULT_TERMS,
  EntranceTicketCatalogItem,
  HotelRateCard,
  LogoData,
  PartnerHotel,
  SavedQuotation,
  TermsConfig,
  UserProfile,
  UserRole,
  VOYA_LANKA_PARTNER_HOTELS
} from '../types';
import { sanitizeHotelRateCards } from './hotelRates';

// ==========================================
// 1. User Profiles & Role-Based Access
// ==========================================

export async function fetchUserProfile(userId: string): Promise<UserProfile | null> {
  if (!isSupabaseConfigured()) {
    // Local / unconfigured fallback: default admin profile for preview
    return {
      id: userId,
      email: 'admin@voyalankatours.com',
      fullName: 'Voya Lanka Administrator',
      role: 'ADMIN'
    };
  }

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, full_name, role, created_at')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.warn('Error fetching user profile:', error.message);
      return null;
    }

    if (!data) return null;

    return {
      id: data.id,
      email: data.email,
      fullName: data.full_name,
      role: (data.role as UserRole) || 'STAFF',
      createdAt: data.created_at
    };
  } catch (err) {
    console.error('Failed to fetch user profile:', err);
    return null;
  }
}

export async function fetchAllStaffProfiles(): Promise<UserProfile[]> {
  if (!isSupabaseConfigured()) return [];

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, full_name, role, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching staff list:', error.message);
      throw error;
    }

    return (data || []).map(p => ({
      id: p.id,
      email: p.email,
      fullName: p.full_name,
      role: p.role as UserRole,
      createdAt: p.created_at
    }));
  } catch (err) {
    console.error('Failed to fetch staff list:', err);
    return [];
  }
}

export async function adminCreateStaffAccount(params: {
  email: string;
  password: string;
  fullName: string;
  role: UserRole;
}): Promise<{ success: boolean; message: string }> {
  if (!isSupabaseConfigured()) {
    return {
      success: false,
      message: 'Supabase is not configured yet. Please configure VITE_SUPABASE_URL in .env.'
    };
  }

  try {
    // Call the security definer database function created in the SQL setup
    const { data, error } = await supabase.rpc('admin_create_staff_user', {
      new_email: params.email.trim(),
      new_password: params.password,
      new_full_name: params.fullName.trim(),
      new_role: params.role
    });

    if (error) {
      console.error('admin_create_staff_user RPC error:', error);
      return { success: false, message: error.message };
    }

    return {
      success: true,
      message: `Staff account created successfully for ${params.fullName} (${params.email}).`
    };
  } catch (err: any) {
    console.error('Failed to create staff account:', err);
    return { success: false, message: err.message || 'Could not create staff account.' };
  }
}

export async function adminDeleteStaffAccount(
  targetUserId: string,
  currentUser?: UserProfile | null
): Promise<{ success: boolean; message: string }> {
  if (currentUser && currentUser.role !== 'ADMIN') {
    return {
      success: false,
      message: 'Unauthorized: Only administrators can delete staff accounts.'
    };
  }

  if (currentUser && currentUser.id === targetUserId) {
    return {
      success: false,
      message: 'Operation forbidden: You cannot delete your own account.'
    };
  }

  if (!isSupabaseConfigured()) {
    return {
      success: true,
      message: 'Staff account deleted (preview mode).'
    };
  }

  try {
    // 1. Attempt to invoke the secure Supabase Edge Function 'delete-staff-user'
    // It verifies caller's JWT role as ADMIN and calls auth.admin.deleteUser(targetUserId)
    // using SUPABASE_SERVICE_ROLE_KEY on the server.
    let edgeFnFailed = false;
    let edgeErrMsg = '';

    try {
      const { data, error } = await supabase.functions.invoke('delete-staff-user', {
        body: { targetUserId }
      });

      if (!error && data?.success && data?.authDeleted) {
        return {
          success: true,
          message: data.message || 'Staff member permanently deleted from authentication and database.'
        };
      }

      if (error) {
        edgeFnFailed = true;
        edgeErrMsg = error.message || '';
        if ('context' in error && (error as any).context) {
          try {
            const bodyJson = await (error as any).context.json();
            if (bodyJson?.error) edgeErrMsg = bodyJson.error;
          } catch (_) {}
        }
      }
    } catch (e: any) {
      edgeFnFailed = true;
      edgeErrMsg = e?.message || '';
    }

    // 2. If Edge Function is not yet deployed (404 / failed to connect),
    // fallback to the database stored procedure 'admin_delete_staff_user'
    if (
      edgeFnFailed ||
      edgeErrMsg.includes('404') ||
      edgeErrMsg.toLowerCase().includes('failed to send a request') ||
      edgeErrMsg.toLowerCase().includes('functions fetch error')
    ) {
      console.info("Edge function 'delete-staff-user' not reachable; attempting database RPC 'admin_delete_staff_user'...");

      const { data: rpcData, error: rpcError } = await supabase.rpc('admin_delete_staff_user', {
        target_user_id: targetUserId
      });

      if (!rpcError && rpcData?.success) {
        return {
          success: true,
          message: rpcData.message || 'Staff member permanently deleted from authentication and database.'
        };
      }

      if (rpcError) {
        console.error('admin_delete_staff_user RPC error:', rpcError);
        return {
          success: false,
          message:
            rpcError.message ||
            "Please deploy the 'delete-staff-user' Edge Function via CLI, or run the admin_delete_staff_user script in your Supabase SQL Editor."
        };
      }
    }

    return {
      success: false,
      message: edgeErrMsg || 'Failed to delete staff Authentication account.'
    };
  } catch (err: any) {
    console.error('Failed to execute staff deletion:', err);
    return {
      success: false,
      message: err?.message || 'Could not delete staff account. Please verify database connection.'
    };
  }
}

// ==========================================
// 2. Company Settings & Legal Terms
// ==========================================

export const HOTEL_RATES_SYNC_MARKER = '__VOYA_HOTEL_RATE_CARDS__';
const HOTEL_RATES_SYNC_DEST = '__SYSTEM_SYNC__';

let cachedCloudHotelRates: HotelRateCard[] | null = null;
let cachedCloudHotelRatesUpdatedAt = '';

export interface SharedCompanySettings {
  company: CompanyDetails;
  terms: TermsConfig;
  logo: LogoData | null;
  hotelRateCards?: HotelRateCard[] | null;
  hotelRateCardsUpdatedAt?: string;
  fromCloud?: boolean;
}

function extractTermsAndRates(rawTermsConfig: any): {
  terms: TermsConfig;
  hotelRateCards: HotelRateCard[] | null;
  hotelRateCardsUpdatedAt: string;
} {
  const rawObj =
    rawTermsConfig && typeof rawTermsConfig === 'object' ? { ...rawTermsConfig } : {};
  const rawCards = Array.isArray(rawObj.__hotelRateCards)
    ? sanitizeHotelRateCards(rawObj.__hotelRateCards as HotelRateCard[])
    : null;
  const updatedAt =
    typeof rawObj.__hotelRateCardsUpdatedAt === 'string'
      ? rawObj.__hotelRateCardsUpdatedAt
      : '';

  delete rawObj.__hotelRateCards;
  delete rawObj.__hotelRateCardsUpdatedAt;

  const terms: TermsConfig =
    Object.keys(rawObj).length > 0 ? { ...DEFAULT_TERMS, ...rawObj } : DEFAULT_TERMS;

  return {
    terms,
    hotelRateCards: rawCards,
    hotelRateCardsUpdatedAt: updatedAt
  };
}

export async function fetchCompanySettings(): Promise<SharedCompanySettings> {
  if (!isSupabaseConfigured()) {
    return {
      company: DEFAULT_COMPANY,
      terms: DEFAULT_TERMS,
      logo: null,
      hotelRateCards: null,
      fromCloud: false
    };
  }

  try {
    const { data, error } = await supabase
      .from('company_settings')
      .select('*')
      .eq('id', 1)
      .maybeSingle();

    if (error) {
      console.warn('Error fetching company settings:', error.message);
      return {
        company: DEFAULT_COMPANY,
        terms: DEFAULT_TERMS,
        logo: null,
        hotelRateCards: null,
        fromCloud: false
      };
    }

    if (!data) {
      return {
        company: DEFAULT_COMPANY,
        terms: DEFAULT_TERMS,
        logo: null,
        hotelRateCards: null,
        fromCloud: false
      };
    }

    const company: CompanyDetails = {
      name: data.name || DEFAULT_COMPANY.name,
      address: data.address || DEFAULT_COMPANY.address,
      phone: data.phone || DEFAULT_COMPANY.phone,
      email: data.email || DEFAULT_COMPANY.email,
      website: data.website || DEFAULT_COMPANY.website,
      reg: data.reg || DEFAULT_COMPANY.reg
    };

    let logo: LogoData | null = null;
    if (data.logo_data) {
      try {
        const parsed = typeof data.logo_data === 'string' && data.logo_data.trim().startsWith('{')
          ? JSON.parse(data.logo_data)
          : { data: data.logo_data, w: 200, h: 80 };
        if (parsed && parsed.data) {
          logo = {
            data: parsed.data,
            w: Number(parsed.w) || 200,
            h: Number(parsed.h) || 80
          };
        }
      } catch (_) {
        logo = { data: String(data.logo_data), w: 200, h: 80 };
      }
    }

    const { terms, hotelRateCards, hotelRateCardsUpdatedAt } = extractTermsAndRates(
      data.terms_config
    );

    if (hotelRateCards !== null) {
      cachedCloudHotelRates = hotelRateCards;
      cachedCloudHotelRatesUpdatedAt = hotelRateCardsUpdatedAt;
    }

    return {
      company,
      terms,
      logo,
      hotelRateCards,
      hotelRateCardsUpdatedAt,
      fromCloud: true
    };
  } catch (err) {
    console.error('Failed to load company settings from Supabase:', err);
    return {
      company: DEFAULT_COMPANY,
      terms: DEFAULT_TERMS,
      logo: null,
      hotelRateCards: null,
      fromCloud: false
    };
  }
}

export async function updateCompanySettings(
  company: CompanyDetails,
  logo: LogoData | null,
  terms?: TermsConfig,
  hotelRateCards?: HotelRateCard[]
): Promise<{ success: boolean; message: string }> {
  if (!isSupabaseConfigured()) {
    return { success: true, message: 'Settings saved locally.' };
  }

  try {
    let cardsToPersist = hotelRateCards;
    let updatedAtToPersist =
      hotelRateCards !== undefined ? new Date().toISOString() : cachedCloudHotelRatesUpdatedAt;

    if (cardsToPersist === undefined) {
      if (cachedCloudHotelRates !== null) {
        cardsToPersist = cachedCloudHotelRates;
      } else {
        const { data: existingRow } = await supabase
          .from('company_settings')
          .select('terms_config')
          .eq('id', 1)
          .maybeSingle();
        if (existingRow?.terms_config) {
          const extracted = extractTermsAndRates(existingRow.terms_config);
          cardsToPersist = extracted.hotelRateCards ?? undefined;
          updatedAtToPersist = extracted.hotelRateCardsUpdatedAt;
        }
      }
    } else {
      cachedCloudHotelRates = cardsToPersist;
      cachedCloudHotelRatesUpdatedAt = updatedAtToPersist;
    }

    const payload: any = {
      id: 1,
      name: company.name || DEFAULT_COMPANY.name,
      address: company.address || DEFAULT_COMPANY.address,
      phone: company.phone || DEFAULT_COMPANY.phone,
      email: company.email || DEFAULT_COMPANY.email,
      website: company.website || DEFAULT_COMPANY.website,
      reg: company.reg || DEFAULT_COMPANY.reg,
      logo_data: logo ? JSON.stringify(logo) : null,
      updated_at: new Date().toISOString()
    };

    const termsObj: Record<string, any> = {
      ...(terms || DEFAULT_TERMS)
    };
    delete termsObj.__hotelRateCards;
    delete termsObj.__hotelRateCardsUpdatedAt;

    if (cardsToPersist !== undefined && cardsToPersist !== null) {
      termsObj.__hotelRateCards = cardsToPersist;
      termsObj.__hotelRateCardsUpdatedAt = updatedAtToPersist || new Date().toISOString();
    }

    if (terms || (cardsToPersist !== undefined && cardsToPersist !== null)) {
      payload.terms_config = termsObj;
    }

    const { error } = await supabase
      .from('company_settings')
      .upsert(payload, { onConflict: 'id' });

    if (error) {
      console.error('Error updating company settings:', error);
      if (error.code === '42501' || error.message.includes('row-level security')) {
        return { success: false, message: 'Permission denied: Only administrators can modify company settings.' };
      }
      return { success: false, message: error.message };
    }

    return { success: true, message: 'Company settings saved to cloud database.' };
  } catch (err: any) {
    console.error('Failed to update company settings:', err);
    return { success: false, message: err.message || 'Could not update company settings.' };
  }
}

export async function fetchHotelRatesFromCloud(): Promise<{
  rateCards: HotelRateCard[] | null;
  updatedAt: string;
}> {
  if (!isSupabaseConfigured()) {
    return { rateCards: null, updatedAt: '' };
  }

  let companyCards: HotelRateCard[] | null = null;
  let companyUpdatedAt = '';
  let partnerCards: HotelRateCard[] | null = null;
  let partnerUpdatedAt = '';

  try {
    const { data: csRow } = await supabase
      .from('company_settings')
      .select('terms_config')
      .eq('id', 1)
      .maybeSingle();

    if (csRow?.terms_config) {
      const extracted = extractTermsAndRates(csRow.terms_config);
      companyCards = extracted.hotelRateCards;
      companyUpdatedAt = extracted.hotelRateCardsUpdatedAt;
    }
  } catch (err) {
    console.warn('Could not read hotel rates from company_settings:', err);
  }

  try {
    const { data: phRow } = await supabase
      .from('partner_hotels')
      .select('category')
      .eq('name', HOTEL_RATES_SYNC_MARKER)
      .eq('destination', HOTEL_RATES_SYNC_DEST)
      .maybeSingle();

    if (phRow?.category) {
      const parsed = JSON.parse(phRow.category);
      if (parsed && Array.isArray(parsed.cards)) {
        partnerCards = sanitizeHotelRateCards(parsed.cards);
        partnerUpdatedAt = typeof parsed.updatedAt === 'string' ? parsed.updatedAt : '';
      }
    }
  } catch (_) {
    // Ignore if unauthenticated or marker row doesn't exist
  }

  if (partnerCards && companyCards) {
    const chosen = partnerUpdatedAt > companyUpdatedAt ? partnerCards : companyCards;
    const chosenAt = partnerUpdatedAt > companyUpdatedAt ? partnerUpdatedAt : companyUpdatedAt;
    cachedCloudHotelRates = chosen;
    cachedCloudHotelRatesUpdatedAt = chosenAt;
    return { rateCards: chosen, updatedAt: chosenAt };
  }

  if (partnerCards) {
    cachedCloudHotelRates = partnerCards;
    cachedCloudHotelRatesUpdatedAt = partnerUpdatedAt;
    return { rateCards: partnerCards, updatedAt: partnerUpdatedAt };
  }

  if (companyCards) {
    cachedCloudHotelRates = companyCards;
    cachedCloudHotelRatesUpdatedAt = companyUpdatedAt;
    return { rateCards: companyCards, updatedAt: companyUpdatedAt };
  }

  return { rateCards: null, updatedAt: '' };
}

export async function saveHotelRatesToCloud(
  rateCards: HotelRateCard[],
  company?: CompanyDetails,
  terms?: TermsConfig,
  logo?: LogoData | null
): Promise<{ success: boolean; message: string }> {
  const sanitized = sanitizeHotelRateCards(rateCards);
  const nowIso = new Date().toISOString();
  cachedCloudHotelRates = sanitized;
  cachedCloudHotelRatesUpdatedAt = nowIso;

  if (!isSupabaseConfigured()) {
    return { success: true, message: 'Hotel rates saved locally.' };
  }

  try {
    const { data: existingRow } = await supabase
      .from('company_settings')
      .select('id, terms_config')
      .eq('id', 1)
      .maybeSingle();

    const baseTerms: Record<string, any> =
      existingRow?.terms_config && typeof existingRow.terms_config === 'object'
        ? { ...existingRow.terms_config }
        : { ...(terms || DEFAULT_TERMS) };

    baseTerms.__hotelRateCards = sanitized;
    baseTerms.__hotelRateCardsUpdatedAt = nowIso;

    if (existingRow) {
      const { error } = await supabase
        .from('company_settings')
        .update({
          terms_config: baseTerms,
          updated_at: nowIso
        })
        .eq('id', 1);

      if (!error) {
        return { success: true, message: 'Hotel rates synced to cloud for all users!' };
      }

      if (error.code !== '42501' && !error.message.includes('row-level security')) {
        console.warn('Error updating company_settings hotel rates:', error.message);
      }
    } else if (company) {
      const res = await updateCompanySettings(company, logo ?? null, terms, sanitized);
      if (res.success) {
        return { success: true, message: 'Hotel rates synced to cloud for all users!' };
      }
    }
  } catch (err) {
    console.warn('Primary cloud hotel rate save skipped, trying team sync fallback:', err);
  }

  // Fallback for STAFF users (who do not have admin RLS on company_settings):
  // Persist via authenticated partner_hotels system sync row
  try {
    const syncPayload = JSON.stringify({
      updatedAt: nowIso,
      cards: sanitized
    });

    const { data: existingMarker } = await supabase
      .from('partner_hotels')
      .select('id')
      .eq('name', HOTEL_RATES_SYNC_MARKER)
      .eq('destination', HOTEL_RATES_SYNC_DEST)
      .maybeSingle();

    if (existingMarker?.id) {
      const { error } = await supabase
        .from('partner_hotels')
        .update({ category: syncPayload })
        .eq('id', existingMarker.id);

      if (error) {
        return { success: false, message: error.message };
      }
    } else {
      const { error } = await supabase
        .from('partner_hotels')
        .insert({
          name: HOTEL_RATES_SYNC_MARKER,
          destination: HOTEL_RATES_SYNC_DEST,
          category: syncPayload
        });

      if (error) {
        return { success: false, message: error.message };
      }
    }

    return { success: true, message: 'Hotel rates synced to cloud for all team members!' };
  } catch (err: any) {
    console.error('Failed to sync hotel rates to cloud:', err);
    return {
      success: false,
      message: err?.message || 'Could not sync hotel rates to cloud.'
    };
  }
}

// ==========================================
// 3. Quotations Management (Cloud)
// ==========================================

export async function fetchQuotations(): Promise<SavedQuotation[]> {
  if (!isSupabaseConfigured()) return [];

  try {
    const { data, error } = await supabase
      .from('quotations')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching quotations:', error.message);
      return [];
    }

    return (data || []).map(row => {
      const qd = row.quotation_data || {};
      return {
        id: row.id,
        savedAt: row.created_at,
        customer: qd.customer || {
          qno: row.id,
          custName: row.customer_name || '',
          custEmail: row.customer_email || '',
          custPhone: row.customer_phone || '',
          custCountry: row.customer_country || '',
          travelDate: row.travel_date || '',
          custNotes: ''
        },
        pax: qd.pax || { adults: row.adults || 2, child12: 0, child5: 0, days: row.days || 1 },
        transport: qd.transport || { vehicleType: '', vRate: 0, fuelKm: 0, fuelAvg: 0, fuelPrice: 0, drvDay: 0 },
        guide: qd.guide || { guideType: '', guideFee: 0, crewRoom: 0 },
        pricing: qd.pricing || { usdRate: 305, toll: 0, waterQty: 0, markup: 0, discType: 'pct', discVal: 0 },
        others: qd.others || [],
        nights: qd.nights || [],
        terms: qd.terms || DEFAULT_TERMS,
        itinerary: qd.itinerary || null,
        vconf: qd.vconf || {},
        finLKR: qd.finLKR || String(row.fin_lkr || 0),
        finUSD: qd.finUSD || String(row.fin_usd || 0),
        finLKRn: Number(row.fin_lkr) || qd.finLKRn || 0,
        finUSDn: Number(row.fin_usd) || qd.finUSDn || 0,
        isConfirmed: Boolean(qd.isConfirmed),
        confirmedAt: qd.confirmedAt || undefined,
        checklist: qd.checklist || undefined
      };
    });
  } catch (err) {
    console.error('Failed to load quotations from Supabase:', err);
    return [];
  }
}

export async function saveQuotationToCloud(
  quote: SavedQuotation,
  userProfile?: UserProfile | null
): Promise<{ success: boolean; message: string }> {
  if (!isSupabaseConfigured()) {
    return { success: true, message: 'Saved locally.' };
  }

  try {
    const quotePayload = {
      id: quote.id,
      customer_name: (quote.customer?.custName || 'Guest').trim(),
      customer_email: (quote.customer?.custEmail || '').trim(),
      customer_phone: (quote.customer?.custPhone || '').trim(),
      customer_country: (quote.customer?.custCountry || '').trim(),
      travel_date: quote.customer?.travelDate || '',
      days: Number(quote.pax?.days) || 1,
      adults: Number(quote.pax?.adults) || 2,
      fin_lkr: Number(quote.finLKRn) || 0,
      fin_usd: Number(quote.finUSDn) || 0,
      quotation_data: quote,
      created_by_name: userProfile?.fullName || 'Staff User',
      updated_at: new Date().toISOString()
    };

    const { error } = await supabase
      .from('quotations')
      .upsert(quotePayload, { onConflict: 'id' });

    if (error) {
      console.error('Error saving quotation to Supabase:', error);
      return { success: false, message: error.message };
    }

    // Automatically upsert customer in CRM database
    if (quote.customer && quote.customer.custName?.trim()) {
      await upsertCustomerFromQuoteCloud(quote.customer, quote.id);
    }

    return { success: true, message: `Quotation ${quote.id} saved to cloud database!` };
  } catch (err: any) {
    console.error('Failed to save quotation:', err);
    return { success: false, message: err.message || 'Could not save quotation.' };
  }
}

export async function deleteQuotationFromCloud(
  id: string
): Promise<{ success: boolean; message: string }> {
  if (!isSupabaseConfigured()) {
    return { success: true, message: 'Deleted locally.' };
  }

  try {
    const { error } = await supabase
      .from('quotations')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting quotation from Supabase:', error);
      if (error.code === '42501' || error.message.includes('row-level security')) {
        return { success: false, message: 'Permission denied: Only administrators can delete quotation records.' };
      }
      return { success: false, message: error.message };
    }

    return { success: true, message: `Quotation ${id} deleted from cloud database.` };
  } catch (err: any) {
    console.error('Failed to delete quotation:', err);
    return { success: false, message: err.message || 'Could not delete quotation.' };
  }
}

export async function clearAllQuotationsFromCloud(): Promise<{ success: boolean; message: string }> {
  if (!isSupabaseConfigured()) return { success: true, message: 'Cleared.' };

  try {
    const { error } = await supabase
      .from('quotations')
      .delete()
      .neq('id', '');

    if (error) {
      if (error.code === '42501' || error.message.includes('row-level security')) {
        return { success: false, message: 'Permission denied: Only administrators can clear quotations repository.' };
      }
      return { success: false, message: error.message };
    }

    return { success: true, message: 'All quotations cleared from cloud.' };
  } catch (err: any) {
    return { success: false, message: err.message || 'Failed to clear quotations.' };
  }
}

// ==========================================
// 4. Customer Database (CRM)
// ==========================================

export async function fetchCustomers(): Promise<CustomerRecord[]> {
  if (!isSupabaseConfigured()) return [];

  try {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .order('last_quoted_date', { ascending: false });

    if (error) {
      console.error('Error fetching customers:', error.message);
      return [];
    }

    return (data || []).map(row => ({
      id: row.id,
      name: row.name,
      email: row.email || '',
      phone: row.phone || '',
      country: row.country || '',
      notes: row.notes || '',
      createdDate: row.created_date,
      lastQuotedDate: row.last_quoted_date,
      totalQuotes: Number(row.total_quotes) || 0,
      quoteIds: Array.isArray(row.quote_ids) ? row.quote_ids : []
    }));
  } catch (err) {
    console.error('Failed to load customers from Supabase:', err);
    return [];
  }
}

export async function saveCustomerToCloud(
  customer: CustomerRecord
): Promise<{ success: boolean; message: string }> {
  if (!isSupabaseConfigured()) {
    return { success: true, message: 'Customer saved locally.' };
  }

  try {
    const payload = {
      id: customer.id,
      name: customer.name.trim(),
      email: (customer.email || '').trim(),
      phone: (customer.phone || '').trim(),
      country: (customer.country || '').trim(),
      notes: (customer.notes || '').trim(),
      total_quotes: customer.totalQuotes || 0,
      quote_ids: customer.quoteIds || [],
      last_quoted_date: customer.lastQuotedDate || new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { error } = await supabase
      .from('customers')
      .upsert(payload, { onConflict: 'id' });

    if (error) {
      console.error('Error saving customer:', error);
      return { success: false, message: error.message };
    }

    return { success: true, message: `Customer "${customer.name}" saved to CRM database.` };
  } catch (err: any) {
    console.error('Failed to save customer:', err);
    return { success: false, message: err.message || 'Could not save customer.' };
  }
}

export async function upsertCustomerFromQuoteCloud(
  customerDetails: CustomerDetails,
  quoteId: string
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const trimmedName = (customerDetails.custName || '').trim();
  if (!trimmedName) return;

  try {
    const trimmedEmail = (customerDetails.custEmail || '').trim().toLowerCase();
    const trimmedPhone = (customerDetails.custPhone || '').trim();

    // Look for matching customer by email, phone, or exact name
    let query = supabase.from('customers').select('*');
    if (trimmedEmail) {
      query = query.eq('email', trimmedEmail);
    } else if (trimmedPhone) {
      query = query.eq('phone', trimmedPhone);
    } else {
      query = query.ilike('name', trimmedName);
    }

    const { data: matches } = await query.limit(1);
    const existing = matches?.[0];
    const now = new Date().toISOString();

    if (existing) {
      const existingQuoteIds = Array.isArray(existing.quote_ids) ? existing.quote_ids : [];
      const updatedQuoteIds = existingQuoteIds.includes(quoteId)
        ? existingQuoteIds
        : [quoteId, ...existingQuoteIds];

      await supabase
        .from('customers')
        .update({
          name: trimmedName,
          email: customerDetails.custEmail?.trim() || existing.email,
          phone: customerDetails.custPhone?.trim() || existing.phone,
          country: customerDetails.custCountry?.trim() || existing.country,
          notes: customerDetails.custNotes?.trim() || existing.notes,
          last_quoted_date: now,
          total_quotes: updatedQuoteIds.length,
          quote_ids: updatedQuoteIds,
          updated_at: now
        })
        .eq('id', existing.id);
    } else {
      const newId = `cust_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      await supabase
        .from('customers')
        .insert({
          id: newId,
          name: trimmedName,
          email: customerDetails.custEmail?.trim() || '',
          phone: customerDetails.custPhone?.trim() || '',
          country: customerDetails.custCountry?.trim() || '',
          notes: customerDetails.custNotes?.trim() || '',
          created_date: now,
          last_quoted_date: now,
          total_quotes: 1,
          quote_ids: [quoteId],
          updated_at: now
        });
    }
  } catch (err) {
    console.error('Error auto-upserting customer from quote:', err);
  }
}

export async function deleteCustomerFromCloud(
  id: string
): Promise<{ success: boolean; message: string }> {
  if (!isSupabaseConfigured()) {
    return { success: true, message: 'Deleted locally.' };
  }

  try {
    const { error } = await supabase
      .from('customers')
      .delete()
      .eq('id', id);

    if (error) {
      if (error.code === '42501' || error.message.includes('row-level security')) {
        return { success: false, message: 'Permission denied: Only administrators can delete customer records.' };
      }
      return { success: false, message: error.message };
    }

    return { success: true, message: 'Customer removed from CRM database.' };
  } catch (err: any) {
    return { success: false, message: err.message || 'Could not delete customer.' };
  }
}

// ==========================================
// 5. Partner Hotels (Cloud)
// ==========================================

export async function fetchPartnerHotels(): Promise<PartnerHotel[]> {
  if (!isSupabaseConfigured()) return VOYA_LANKA_PARTNER_HOTELS;

  try {
    const { data, error } = await supabase
      .from('partner_hotels')
      .select('name, destination, category')
      .order('destination', { ascending: true })
      .order('name', { ascending: true });

    if (error) {
      console.error('Error fetching partner hotels:', error.message);
      return VOYA_LANKA_PARTNER_HOTELS;
    }

    const filtered = (data || []).filter(h => h.name !== HOTEL_RATES_SYNC_MARKER);

    if (filtered.length === 0) {
      // Auto-seed default partner hotels if table is fresh
      await seedDefaultPartnerHotels();
      return VOYA_LANKA_PARTNER_HOTELS;
    }

    return filtered;
  } catch (err) {
    console.error('Failed to load partner hotels from Supabase:', err);
    return VOYA_LANKA_PARTNER_HOTELS;
  }
}

export async function seedDefaultPartnerHotels(): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    const rows = VOYA_LANKA_PARTNER_HOTELS.map(h => ({
      name: h.name,
      destination: h.destination,
      category: h.category
    }));
    await supabase.from('partner_hotels').upsert(rows, { onConflict: 'name,destination' });
  } catch (err) {
    console.warn('Could not seed partner hotels:', err);
  }
}

export async function addPartnerHotelToCloud(
  hotel: PartnerHotel
): Promise<{ success: boolean; message: string; hotels: PartnerHotel[] }> {
  const trimmedName = (hotel.name || '').trim();
  const trimmedDest = (hotel.destination || '').trim();
  const category = (hotel.category || '4-Star Premium').trim();

  if (!trimmedName || !trimmedDest) {
    return { success: false, message: 'Hotel name and destination are required.', hotels: await fetchPartnerHotels() };
  }

  if (!isSupabaseConfigured()) {
    return { success: true, message: 'Added locally.', hotels: VOYA_LANKA_PARTNER_HOTELS };
  }

  try {
    const { error } = await supabase
      .from('partner_hotels')
      .insert({
        name: trimmedName,
        destination: trimmedDest,
        category
      });

    if (error) {
      if (error.code === '23505') {
        return {
          success: false,
          message: `"${trimmedName} - ${trimmedDest}" already exists in partner directory.`,
          hotels: await fetchPartnerHotels()
        };
      }
      return { success: false, message: error.message, hotels: await fetchPartnerHotels() };
    }

    const updated = await fetchPartnerHotels();
    return { success: true, message: `Added "${trimmedName} - ${trimmedDest}" to partner directory!`, hotels: updated };
  } catch (err: any) {
    return { success: false, message: err.message, hotels: await fetchPartnerHotels() };
  }
}

export async function updatePartnerHotelInCloud(
  original: PartnerHotel,
  updated: PartnerHotel
): Promise<{ success: boolean; message: string; hotels: PartnerHotel[] }> {
  if (!isSupabaseConfigured()) {
    return { success: true, message: 'Updated locally.', hotels: VOYA_LANKA_PARTNER_HOTELS };
  }

  try {
    const { error } = await supabase
      .from('partner_hotels')
      .update({
        name: updated.name.trim(),
        destination: updated.destination.trim(),
        category: updated.category.trim()
      })
      .ilike('name', original.name.trim())
      .ilike('destination', original.destination.trim());

    if (error) {
      return { success: false, message: error.message, hotels: await fetchPartnerHotels() };
    }

    const refreshed = await fetchPartnerHotels();
    return { success: true, message: `Updated "${updated.name}"!`, hotels: refreshed };
  } catch (err: any) {
    return { success: false, message: err.message, hotels: await fetchPartnerHotels() };
  }
}

export async function deletePartnerHotelFromCloud(
  hotel: { name: string; destination: string }
): Promise<{ success: boolean; message: string; hotels: PartnerHotel[] }> {
  if (!isSupabaseConfigured()) {
    return { success: true, message: 'Deleted locally.', hotels: VOYA_LANKA_PARTNER_HOTELS };
  }

  try {
    const { error } = await supabase
      .from('partner_hotels')
      .delete()
      .ilike('name', hotel.name.trim())
      .ilike('destination', hotel.destination.trim());

    if (error) {
      if (error.code === '42501' || error.message.includes('row-level security')) {
        return {
          success: false,
          message: 'Permission denied: Only administrators can delete partner hotels.',
          hotels: await fetchPartnerHotels()
        };
      }
      return { success: false, message: error.message, hotels: await fetchPartnerHotels() };
    }

    const refreshed = await fetchPartnerHotels();
    return { success: true, message: `Removed "${hotel.name}" from partner directory.`, hotels: refreshed };
  } catch (err: any) {
    return { success: false, message: err.message, hotels: await fetchPartnerHotels() };
  }
}

export async function restoreDefaultPartnerHotelsCloud(): Promise<{
  success: boolean;
  message: string;
  hotels: PartnerHotel[];
}> {
  if (!isSupabaseConfigured()) {
    return { success: true, message: 'Restored default partner hotels.', hotels: VOYA_LANKA_PARTNER_HOTELS };
  }

  try {
    await seedDefaultPartnerHotels();
    const refreshed = await fetchPartnerHotels();
    return {
      success: true,
      message: `Restored default Voya Lanka partner hotels.`,
      hotels: refreshed
    };
  } catch (err: any) {
    return { success: false, message: err.message, hotels: await fetchPartnerHotels() };
  }
}

// ==========================================
// 6. Entrance Tickets & Activities
// ==========================================

export async function fetchEntranceTickets(): Promise<EntranceTicketCatalogItem[]> {
  if (!isSupabaseConfigured()) return DEFAULT_ENTRANCE_TICKETS;

  try {
    const { data, error } = await supabase
      .from('entrance_tickets')
      .select('id, name, price_usd, price_lkr, category')
      .order('sort_order', { ascending: true });

    if (error || !data || data.length === 0) {
      await seedDefaultTickets();
      return DEFAULT_ENTRANCE_TICKETS;
    }

    return data.map(d => ({
      id: d.id,
      name: d.name,
      priceUsd: Number(d.price_usd),
      priceLkr: Number(d.price_lkr),
      category: d.category
    }));
  } catch (err) {
    return DEFAULT_ENTRANCE_TICKETS;
  }
}

export async function seedDefaultTickets(): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    const rows = DEFAULT_ENTRANCE_TICKETS.map((t, idx) => ({
      id: t.id,
      name: t.name,
      price_usd: t.priceUsd,
      price_lkr: t.priceLkr || Math.round(t.priceUsd * 305),
      category: t.category || 'Attraction',
      sort_order: idx
    }));
    await supabase.from('entrance_tickets').upsert(rows, { onConflict: 'id' });
  } catch (_) {}
}

// ==========================================
// 7. User Draft Storage (Per-User Isolation)
// ==========================================

export async function fetchUserDraftFromCloud(userId: string): Promise<any | null> {
  if (!isSupabaseConfigured()) return null;

  try {
    const { data, error } = await supabase
      .from('user_drafts')
      .select('draft_data')
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !data) return null;
    return data.draft_data;
  } catch (_) {
    return null;
  }
}

export async function saveUserDraftToCloud(userId: string, draftData: any): Promise<void> {
  if (!isSupabaseConfigured()) return;

  try {
    await supabase
      .from('user_drafts')
      .upsert({
        user_id: userId,
        draft_data: draftData,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });
  } catch (_) {}
}

export async function clearUserDraftInCloud(userId: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    await supabase.from('user_drafts').delete().eq('user_id', userId);
  } catch (_) {}
}

// ==========================================
// 8. Real-time Multi-User Sync Listener
// ==========================================

export function subscribeToCloudChanges(callbacks: {
  onQuotationsChange?: () => void;
  onCustomersChange?: () => void;
  onHotelsChange?: () => void;
  onCompanySettingsChange?: () => void;
  onActivityLogsChange?: () => void;
}) {
  if (!isSupabaseConfigured()) return () => {};

  const channel = supabase
    .channel('voya-lanka-live-updates')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'quotations' },
      () => {
        callbacks.onQuotationsChange?.();
      }
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'customers' },
      () => {
        callbacks.onCustomersChange?.();
      }
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'partner_hotels' },
      () => {
        callbacks.onHotelsChange?.();
      }
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'company_settings' },
      () => {
        callbacks.onCompanySettingsChange?.();
      }
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'activity_logs' },
      () => {
        callbacks.onActivityLogsChange?.();
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

// ==========================================
// 9. User Activity & Audit Logs
// ==========================================

const LOCAL_ACTIVITY_LOGS_KEY = 'voya_lanka_activity_logs_v1';

export function loadLocalActivityLogs(): ActivityLog[] {
  try {
    const raw = localStorage.getItem(LOCAL_ACTIVITY_LOGS_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveLocalActivityLogs(logs: ActivityLog[]): void {
  try {
    localStorage.setItem(LOCAL_ACTIVITY_LOGS_KEY, JSON.stringify(logs.slice(0, 200)));
  } catch (err) {
    console.warn('Failed to save activity logs locally:', err);
  }
}

export async function logActivity(params: {
  action: ActivityAction;
  entity_type: ActivityEntityType;
  entity_id?: string | null;
  summary: string;
  details?: Record<string, any>;
  user?: UserProfile | null;
}): Promise<void> {
  const timestamp = new Date().toISOString();
  const logId = `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  let userEmail = params.user?.email || 'admin@voyalankatours.com';
  let userName = params.user?.fullName || 'Voya Lanka Admin';
  let userRole = params.user?.role || 'ADMIN';
  let userId = params.user?.id || null;

  if (!params.user && isSupabaseConfigured()) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        userId = session.user.id;
        userEmail = session.user.email || userEmail;
        userName = session.user.user_metadata?.full_name || userEmail.split('@')[0];
        userRole = (session.user.user_metadata?.role as UserRole) || 'STAFF';
      }
    } catch (_) {}
  }

  const logEntry: ActivityLog = {
    id: logId,
    created_at: timestamp,
    user_id: userId,
    user_email: userEmail,
    user_name: userName,
    user_role: userRole,
    action: params.action,
    entity_type: params.entity_type,
    entity_id: params.entity_id || null,
    summary: params.summary,
    details: params.details || {}
  };

  // 1. Immediately cache locally
  try {
    const currentLogs = loadLocalActivityLogs();
    const updated = [logEntry, ...currentLogs];
    saveLocalActivityLogs(updated);
  } catch (_) {}

  // 2. Dispatch custom in-app event for immediate reactive UI update
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('voya_activity_logged', { detail: logEntry }));
  }

  // 3. Persist to Supabase if configured (tamper-proof cloud audit log)
  if (isSupabaseConfigured()) {
    try {
      const { error } = await supabase.from('activity_logs').insert({
        user_id: userId,
        user_email: userEmail,
        user_name: userName,
        user_role: userRole,
        action: params.action,
        entity_type: params.entity_type,
        entity_id: params.entity_id || null,
        summary: params.summary,
        details: params.details || {}
      });

      if (error) {
        console.warn('Could not persist activity log to Supabase:', error.message);
      }
    } catch (err) {
      console.warn('Network exception while logging activity to cloud:', err);
    }
  }
}

export async function fetchActivityLogs(limit = 100): Promise<ActivityLog[]> {
  const localLogs = loadLocalActivityLogs();

  if (!isSupabaseConfigured()) {
    return localLogs;
  }

  try {
    const { data, error } = await supabase
      .from('activity_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.warn('Could not fetch cloud activity logs, using local cache:', error.message);
      return localLogs;
    }

    if (!data || data.length === 0) {
      return localLogs;
    }

    const cloudLogs: ActivityLog[] = data.map((d: any) => ({
      id: d.id,
      created_at: d.created_at,
      user_id: d.user_id,
      user_email: d.user_email,
      user_name: d.user_name,
      user_role: d.user_role as UserRole,
      action: d.action as ActivityAction,
      entity_type: d.entity_type as ActivityEntityType,
      entity_id: d.entity_id,
      summary: d.summary,
      details: d.details || {}
    }));

    saveLocalActivityLogs(cloudLogs);
    return cloudLogs;
  } catch (err) {
    console.warn('Exception fetching activity logs:', err);
    return localLogs;
  }
}

