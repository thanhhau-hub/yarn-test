import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useArea } from '../../hooks/useArea';
import { useRole } from '../../hooks/useRole';
import { YarnRoll } from '../../types';
import { Ionicons } from '@expo/vector-icons';

/**
 * Area Detail Screen
 * Shows all LOTs currently stored in a specific area.
 * Workers can tap a LOT to view its history or move it.
 * Edit/Delete actions only shown to Supervisors.
 * Route: /area/[id]
 */
export default function AreaDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { yarns, loading, refetch } = useArea(id);
  const { role } = useRole();
  const insets = useSafeAreaInsets();

  function cleanLot(code: string) {
    return code.replace(/-\d+$/, '');
  }

  function renderYarn({ item }: { item: YarnRoll }) {
    const cleanedCode = cleanLot(item.yarn_code);
    return (
      <View style={styles.lotCard}>
        <View style={styles.lotLeft}>
          <Text style={styles.lotCode}>LOT: {cleanedCode}</Text>
          <Text style={styles.lotMeta}>Status: {item.status}</Text>
        </View>
        <View style={styles.lotActions}>
          <TouchableOpacity
            style={styles.historyBtn}
            onPress={() => router.push(`/yarn/${item.id}`)}
            activeOpacity={0.7}
          >
            <Ionicons name="time-outline" size={14} color="#1b4d3e" />
          </TouchableOpacity>
          {role === 'supervisor' && (
            <TouchableOpacity
              style={styles.moveButton}
              onPress={() => router.push(`/move/${item.id}`)}
              activeOpacity={0.7}
            >
              <Ionicons name="swap-horizontal" size={14} color="#ffffff" style={{ marginRight: 4 }} />
              <Text style={styles.moveButtonText}>Move</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Count banner */}
      <View style={styles.countBanner}>
        <View style={styles.countLeft}>
          <Ionicons name="cube-outline" size={16} color="#1b4d3e" style={{ marginRight: 6 }} />
          <Text style={styles.countText}>
            {yarns.length} LOT{yarns.length !== 1 ? 's' : ''} stored here
          </Text>
        </View>
        {yarns.length === 0 && (
          <View style={styles.emptyBadge}>
            <Text style={styles.emptyBadgeText}>Empty</Text>
          </View>
        )}
      </View>

      <FlatList
        data={yarns}
        keyExtractor={(item) => item.id}
        renderItem={renderYarn}
        contentContainerStyle={[styles.list, { paddingBottom: Math.max(insets.bottom, 16) }]}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={refetch}
            colors={['#1b4d3e']}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="archive-outline" size={52} color="#cbd5e1" />
            <Text style={styles.emptyText}>
              {loading ? 'Loading...' : 'This rack is empty.'}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },

  // Count banner
  countBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#e8f5e9',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#c8e6c9',
  },
  countLeft: { flexDirection: 'row', alignItems: 'center' },
  countText: { color: '#1b4d3e', fontWeight: '700', fontSize: 14 },
  emptyBadge: {
    backgroundColor: '#f1f5f9',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  emptyBadgeText: { fontSize: 11, fontWeight: '700', color: '#64748b' },

  // List
  list: { padding: 12, paddingBottom: 32 },

  // LOT card
  lotCard: {
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
  lotLeft: { flex: 1 },
  lotCode: { fontSize: 16, fontWeight: '800', color: '#1e293b' },
  lotMeta: { fontSize: 12, color: '#64748b', marginTop: 3, fontWeight: '500' },
  lotActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },

  historyBtn: {
    backgroundColor: '#e8f5e9',
    borderRadius: 8,
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  moveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1b4d3e',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 36,
  },
  moveButtonText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  // Empty state
  emptyContainer: { alignItems: 'center', marginTop: 70, gap: 12 },
  emptyText: { color: '#94a3b8', fontSize: 15, fontWeight: '500' },
});
