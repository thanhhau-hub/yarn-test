import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  AppState,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import DatePicker from '../../components/DatePicker';

/**
 * Warehouse History Screen
 * 
 * Reads directly from move_logs — does NOT join yarn_rolls.
 * This means records persist even after lots are deleted.
 * Shows: Action Type, Yarn Code, From/To Area, User, Timestamp.
 * History is read-only (no deletion allowed from UI).
 */

type HistoryItem = {
  id: string;
  yarn_roll_id: string | null;
  action: string | null;
  yarn_code: string | null;
  from_area_code: string | null;
  to_area_code: string | null;
  moved_at: string;
  note: string | null;
  moved_by: string | null;
};

export default function HistoryScreen() {
  const [logs, setLogs] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);

  const formatDisplayDate = (dateStr: string) => {
    if (!dateStr || dateStr.length !== 10) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${String(d.getDate()).padStart(2, '0')} ${months[d.getMonth()]} ${d.getFullYear()}`;
  };

  async function fetchHistory(isSilent = false, retryCount = 0) {
    if (!isSilent && retryCount === 0) setLoading(true);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout

    let query = supabase
      .from('move_logs')
      .select(`
        id,
        yarn_roll_id,
        action,
        yarn_code,
        from_area_code,
        to_area_code,
        moved_at,
        note,
        moved_by
      `)
      .order('moved_at', { ascending: false })
      .limit(200)
      .abortSignal(controller.signal);

    if (fromDate && fromDate.length === 10) {
      query = query.gte('moved_at', fromDate + 'T00:00:00.000Z');
    }
    if (toDate && toDate.length === 10) {
      query = query.lte('moved_at', toDate + 'T23:59:59.999Z');
    }

    try {
      const { data, error } = await query;
      clearTimeout(timeoutId);

      if (!error && data) {
        setLogs(data as unknown as HistoryItem[]);
      } else if (error) {
        throw error;
      }
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError' && retryCount < 1) {
        console.warn('fetchHistory timed out, retrying...');
        return fetchHistory(isSilent, retryCount + 1);
      }
      console.warn('fetchHistory error:', err.message);
    } finally {
      if (retryCount === 0) setLoading(false);
    }
  }

  // Reload history when screen is focused
  useFocusEffect(
    useCallback(() => {
      fetchHistory();
    }, [fromDate, toDate])
  );

  // Background return listener
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        fetchHistory(true); // silent fetch
      }
    });
    return () => subscription.remove();
  }, [fromDate, toDate]);

  async function handleRefresh() {
    setRefreshing(true);
    await fetchHistory(true);
    setRefreshing(false);
  }

  // Parse note JSON safely
  function parseLogDetails(item: HistoryItem) {
    let action = 'MOVE';
    let operator = 'Operator';
    let details = '';

    if (item.action) action = item.action;
    else if (!item.from_area_code && item.to_area_code) action = 'CREATE';
    else if (item.from_area_code && !item.to_area_code) action = 'DELETE';

    if (item.note) {
      const trimmedNote = item.note.trim();
      if (trimmedNote.startsWith('{') && trimmedNote.endsWith('}')) {
        try {
          const parsed = JSON.parse(trimmedNote);
          if (parsed.action) action = parsed.action;
          if (parsed.operator) operator = parsed.operator;
          if (parsed.details) details = parsed.details;
          else details = '';
        } catch (e) {
          // Fallback to legacy
        }
      }
    }

    if (action === 'Added') action = 'CREATE';
    if (action === 'Moved') action = 'MOVE';
    if (action === 'Deleted') action = 'DELETE';
    if (action === 'Edited') action = 'EDIT';

    return { action, operator, details };
  }

  function getActionBadge(action: string) {
    switch (action) {
      case 'CREATE':
        return { bg: '#e8f5e9', text: '#2e7d32', icon: 'add-circle-outline' as const };
      case 'MOVE':
        return { bg: '#e3f2fd', text: '#1565c0', icon: 'swap-horizontal-outline' as const };
      case 'DELETE':
        return { bg: '#ffebee', text: '#c62828', icon: 'trash-outline' as const };
      case 'EDIT':
        return { bg: '#fff8e1', text: '#f57f17', icon: 'create-outline' as const };
      case 'ROLE_CHANGE':
        return { bg: '#f3e8ff', text: '#7c3aed', icon: 'people-outline' as const };
      case 'AREA_CREATE':
        return { bg: '#e0f7fa', text: '#00796b', icon: 'location-outline' as const };
      case 'AREA_DISABLE':
        return { bg: '#fce4ec', text: '#c62828', icon: 'location-outline' as const };
      case 'AREA_ENABLE':
        return { bg: '#ecfdf5', text: '#047857', icon: 'location-outline' as const };
      default:
        return { bg: '#f5f5f5', text: '#616161', icon: 'help-circle-outline' as const };
    }
  }

  function formatTime(isoString: string) {
    try {
      const d = new Date(isoString);
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      return `${day}/${month}/${year} ${hours}:${minutes}`;
    } catch (e) {
      return isoString;
    }
  }

  function cleanLot(code: string | null | undefined) {
    if (!code) return 'N/A';
    return code.replace(/-\d+$/, '');
  }

  // Derive the lot code from either the stored yarn_code column or fallback
  function getLotCode(item: HistoryItem, parsedAction: string): string {
    // First try the stored yarn_code column (most reliable, survives deletion)
    if (item.yarn_code) return cleanLot(item.yarn_code);
    return 'N/A';
  }

  return (
    <View style={styles.container}>
      {/* Date Filter */}
      <View style={styles.filterCard}>
        <View style={styles.dateInputWrapper}>
          <Text style={styles.dateLabel}>From:</Text>
          <TouchableOpacity style={styles.dateInputTouchable} onPress={() => setShowFromPicker(true)}>
            <Text style={[styles.dateInputText, !fromDate && styles.datePlaceholder]}>
              {fromDate ? formatDisplayDate(fromDate) : 'Select Date'}
            </Text>
          </TouchableOpacity>
          {fromDate ? (
            <TouchableOpacity onPress={() => setFromDate('')} style={{ padding: 4 }}>
              <Ionicons name="close-circle" size={16} color="#94a3b8" />
            </TouchableOpacity>
          ) : null}
        </View>
        <View style={styles.dateInputWrapper}>
          <Text style={styles.dateLabel}>To:</Text>
          <TouchableOpacity style={styles.dateInputTouchable} onPress={() => setShowToPicker(true)}>
            <Text style={[styles.dateInputText, !toDate && styles.datePlaceholder]}>
              {toDate ? formatDisplayDate(toDate) : 'Select Date'}
            </Text>
          </TouchableOpacity>
          {toDate ? (
            <TouchableOpacity onPress={() => setToDate('')} style={{ padding: 4 }}>
              <Ionicons name="close-circle" size={16} color="#94a3b8" />
            </TouchableOpacity>
          ) : null}
        </View>
        <TouchableOpacity style={styles.filterButton} onPress={fetchHistory}>
          <Ionicons name="search" size={16} color="#fff" />
        </TouchableOpacity>
      </View>

      <DatePicker
        visible={showFromPicker}
        currentDate={fromDate}
        onClose={() => setShowFromPicker(false)}
        onSelect={(d) => { setFromDate(d); setShowFromPicker(false); }}
        title="Select From Date"
        maxDate={toDate || undefined}
      />
      <DatePicker
        visible={showToPicker}
        currentDate={toDate}
        onClose={() => setShowToPicker(false)}
        onSelect={(d) => { setToDate(d); setShowToPicker(false); }}
        title="Select To Date"
        minDate={fromDate || undefined}
      />

      {loading && logs.length === 0 ? (
        <ActivityIndicator style={{ marginTop: 40 }} size="large" color="#1b4d3e" />
      ) : (
        <FlatList
          data={logs}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={['#1b4d3e']} />
          }
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="receipt-outline" size={48} color="#cbd5e1" />
              <Text style={styles.emptyText}>No operations logged yet.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const { action, operator, details } = parseLogDetails(item);
            const badge = getActionBadge(action);
            const lotCode = getLotCode(item, action);
            const fromLoc = item.from_area_code || '—';
            const toLoc = item.to_area_code || '—';

            return (
              <View style={styles.card}>
                {/* Header Row */}
                <View style={styles.cardHeader}>
                  <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                    <Ionicons name={badge.icon} size={14} color={badge.text} style={{ marginRight: 4 }} />
                    <Text style={[styles.badgeText, { color: badge.text }]}>{action}</Text>
                  </View>
                  <Text style={styles.timeText}>{formatTime(item.moved_at)}</Text>
                </View>

                {/* Body Details */}
                <View style={styles.cardBody}>
                  {/* Lot Code */}
                  <View style={styles.detailRow}>
                    <Text style={styles.label}>LOT Code:</Text>
                    <Text style={styles.lotCode}>{lotCode}</Text>
                  </View>

                  {/* Movement / Location */}
                  {action === 'MOVE' ? (
                    <View style={styles.detailRow}>
                      <Text style={styles.label}>Movement:</Text>
                      <View style={styles.movementRow}>
                        <Text style={styles.locationTag}>{fromLoc}</Text>
                        <Ionicons name="arrow-forward" size={12} color="#94a3b8" style={{ marginHorizontal: 4 }} />
                        <Text style={styles.locationTag}>{toLoc}</Text>
                      </View>
                    </View>
                  ) : action === 'CREATE' ? (
                    <View style={styles.detailRow}>
                      <Text style={styles.label}>Placed In:</Text>
                      <Text style={styles.locationTag}>{toLoc}</Text>
                    </View>
                  ) : action === 'DELETE' ? (
                    <View style={styles.detailRow}>
                      <Text style={styles.label}>Removed From:</Text>
                      <Text style={styles.locationTag}>{fromLoc}</Text>
                    </View>
                  ) : null}

                  {/* Details */}
                  {details.trim().length > 0 && (
                    <View style={styles.detailRow}>
                      <Text style={styles.label}>Details:</Text>
                      <Text style={styles.detailsText}>{details}</Text>
                    </View>
                  )}

                  {/* Operator Info */}
                  <View style={styles.operatorRow}>
                    <Ionicons name="person-circle-outline" size={14} color="#64748b" style={{ marginRight: 4 }} />
                    <Text style={styles.operatorText}>{operator}</Text>
                  </View>
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },

  // Date Filter
  filterCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    gap: 8,
  },
  dateInputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  dateLabel: { fontSize: 12, color: '#64748b', fontWeight: '600', marginRight: 4 },
  dateInputTouchable: { flex: 1, paddingVertical: 10 },
  dateInputText: { fontSize: 13, color: '#0f172a' },
  datePlaceholder: { color: '#94a3b8' },
  filterButton: {
    backgroundColor: '#1b4d3e',
    padding: 10,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },

  list: { padding: 12, paddingBottom: 32 },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#1b4d3e',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    paddingBottom: 8,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: { fontSize: 11, fontWeight: '700' },
  timeText: { fontSize: 11, color: '#94a3b8', fontWeight: '500' },
  cardBody: { gap: 6 },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
  },
  movementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  label: { fontSize: 12, color: '#64748b', width: 90, fontWeight: '500' },
  lotCode: { fontSize: 13, fontWeight: '800', color: '#0f172a' },
  valueText: { fontSize: 13, color: '#334155', fontWeight: '600' },
  locationTag: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    borderWidth: 0.5,
    borderColor: '#cbd5e1',
    overflow: 'hidden',
  },
  detailsText: { fontSize: 12, color: '#475569', fontStyle: 'italic', flex: 1 },
  operatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 0.5,
    borderTopColor: '#f1f5f9',
  },
  operatorText: { fontSize: 11, color: '#64748b', fontWeight: '500' },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', marginTop: 80, gap: 8 },
  emptyText: { color: '#94a3b8', fontSize: 14, fontWeight: '600' },
});
