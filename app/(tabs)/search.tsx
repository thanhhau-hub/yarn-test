import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { YarnRoll } from '../../types';
import { Ionicons } from '@expo/vector-icons';

// Strip duplicate suffix to get the base lot code (K446-1 → K446)
function cleanLotNumber(lot: string) {
  if (!lot) return '';
  return lot.replace(/-\d+$/, '');
}

export default function SearchScreen() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<YarnRoll[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  async function handleSearch() {
    const trimmed = query.trim().toUpperCase();
    if (!trimmed) return;

    setLoading(true);
    setSearched(true);

    // Fetch all in-stock yarn rolls whose code starts with the query
    // This captures base lots AND suffixed duplicates (K446, K446-1, K446-2)
    const { data, error } = await supabase
      .from('yarn_rolls')
      .select('id, yarn_code, area_id, status, updated_at, areas(id, code, label)')
      .eq('status', 'in_stock')
      .not('area_id', 'is', null)
      .ilike('yarn_code', `${trimmed}%`)
      .order('updated_at', { ascending: false })
      .limit(50);

    setLoading(false);

    if (!error && data) {
      // Filter server-side results to ensure base lot matches exactly
      // K446 matches K446, K446-1, K446-2 but NOT K4460, K446B
      const regex = new RegExp(`^${trimmed}(-\\d+)?$`, 'i');
      const filtered = (data as unknown as YarnRoll[]).filter((r) =>
        regex.test(r.yarn_code)
      );
      setResults(filtered);
    } else {
      if (error) console.error('Search error:', error.message);
      setResults([]);
    }
  }

  function handleResultPress(item: YarnRoll) {
    const areaId = (item as any).areas?.id;
    const baseLot = cleanLotNumber(item.yarn_code);
    if (areaId) {
      router.push({
        pathname: '/(tabs)',
        params: { openAreaId: areaId, searchLot: baseLot },
      });
    }
  }

  function renderResult({ item }: { item: YarnRoll }) {
    const areaCode = (item as any).areas?.code ?? 'Unknown';
    const baseLot = cleanLotNumber(item.yarn_code);

    return (
      <TouchableOpacity
        style={styles.resultCard}
        onPress={() => handleResultPress(item)}
        activeOpacity={0.7}
      >
        <View style={styles.resultLeft}>
          <Text style={styles.lotCode}>LOT: {baseLot}</Text>
          {item.yarn_code !== baseLot && (
            <Text style={styles.lotVariant}>Internal: {item.yarn_code}</Text>
          )}
        </View>
        <View style={styles.resultRight}>
          <View style={styles.areaBadge}>
            <Ionicons name="location" size={12} color="#ffffff" style={{ marginRight: 3 }} />
            <Text style={styles.areaTag}>{areaCode}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color="#94a3b8" style={{ marginLeft: 8 }} />
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.container}>
      {/* Search Header */}
      <View style={styles.searchHeader}>
        <View style={styles.inputContainer}>
          <Ionicons name="search-outline" size={18} color="#94a3b8" style={styles.searchIcon} />
          <TextInput
            style={styles.input}
            placeholder="Enter exact LOT number"
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
            autoCapitalize="characters"
            placeholderTextColor="#94a3b8"
          />
          {query.length > 0 && (
            <TouchableOpacity
              onPress={() => {
                setQuery('');
                setResults([]);
                setSearched(false);
              }}
              style={styles.clearIcon}
            >
              <Ionicons name="close-circle" size={18} color="#94a3b8" />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity style={styles.searchButton} onPress={handleSearch}>
          <Text style={styles.searchButtonText}>Search</Text>
        </TouchableOpacity>
      </View>

      {/* Results count banner */}
      {searched && !loading && (
        <View style={styles.resultsBanner}>
          <Text style={styles.resultsBannerText}>
            {results.length > 0
              ? `${results.length} result${results.length > 1 ? 's' : ''} found for "${query.trim().toUpperCase()}"`
              : `No exact match for "${query.trim().toUpperCase()}"`}
          </Text>
        </View>
      )}

      {/* Results List */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1b4d3e" />
          <Text style={styles.loadingText}>Searching...</Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          renderItem={renderResult}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            searched ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="alert-circle-outline" size={52} color="#cbd5e1" />
                <Text style={styles.emptyTitle}>Lot not found</Text>
                <Text style={styles.emptySub}>
                  No active lot matching "{query.trim().toUpperCase()}" was found on the floor.{'\n'}
                  Verify the exact LOT number or check if it has been retrieved.
                </Text>
              </View>
            ) : (
              <View style={styles.hintContainer}>
                <View style={styles.hintIconWrapper}>
                  <Ionicons name="barcode-outline" size={52} color="#a7f3d0" />
                </View>
                <Text style={styles.hintTitle}>LOT Number Lookup</Text>
                <Text style={styles.hint}>
                  Type the exact LOT number and tap Search.{'\n'}
                  Tapping a result navigates directly to its rack location on the Board.
                </Text>
                <View style={styles.hintTip}>
                  <Ionicons name="information-circle-outline" size={14} color="#1b4d3e" style={{ marginRight: 6 }} />
                  <Text style={styles.hintTipText}>Exact match: "K446" finds K446, K446-1, K446-2</Text>
                </View>
              </View>
            )
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },

  // Search bar area
  searchHeader: {
    flexDirection: 'row',
    padding: 12,
    gap: 8,
    backgroundColor: '#1b4d3e',
    alignItems: 'center',
  },
  inputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 44,
  },
  searchIcon: { marginRight: 6 },
  clearIcon: { padding: 4 },
  input: {
    flex: 1,
    fontSize: 14,
    color: '#1e293b',
    paddingVertical: 0,
  },
  searchButton: {
    backgroundColor: '#2e7d32',
    borderRadius: 8,
    paddingHorizontal: 18,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchButtonText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  // Results banner
  resultsBanner: {
    backgroundColor: '#e8f5e9',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: '#c8e6c9',
  },
  resultsBannerText: {
    fontSize: 12,
    color: '#2e7d32',
    fontWeight: '600',
  },

  // Loading state
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: { color: '#64748b', fontSize: 14, fontWeight: '500' },

  list: { padding: 12, paddingBottom: 32 },

  // Result card
  resultCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#1b4d3e',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  resultLeft: { flex: 1 },
  lotCode: { fontSize: 16, fontWeight: '800', color: '#1e293b' },
  lotVariant: { fontSize: 11, color: '#94a3b8', marginTop: 2, fontWeight: '500' },
  resultRight: { flexDirection: 'row', alignItems: 'center' },
  areaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1b4d3e',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  areaTag: { color: '#fff', fontSize: 12, fontWeight: '800' },

  // Empty / Hint states
  emptyContainer: { alignItems: 'center', marginTop: 60, padding: 24 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#475569', marginTop: 14, marginBottom: 6 },
  emptySub: {
    textAlign: 'center',
    color: '#94a3b8',
    fontSize: 13,
    lineHeight: 20,
    paddingHorizontal: 12,
  },

  hintContainer: { alignItems: 'center', marginTop: 60, padding: 24 },
  hintIconWrapper: {
    backgroundColor: '#e8f5e9',
    borderRadius: 50,
    width: 88,
    height: 88,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  hintTitle: { fontSize: 17, fontWeight: '800', color: '#1b4d3e', marginBottom: 8 },
  hint: {
    textAlign: 'center',
    color: '#64748b',
    fontSize: 13,
    lineHeight: 20,
    paddingHorizontal: 12,
    marginBottom: 16,
  },
  hintTip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e8f5e9',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  hintTipText: {
    fontSize: 12,
    color: '#1b4d3e',
    fontWeight: '600',
  },
});
