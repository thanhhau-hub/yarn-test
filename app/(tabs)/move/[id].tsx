// app/(tabs)/move/[id].tsx
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, TextInput, Modal, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';


import { supabase } from '../../../lib/supabase';
import { Area, YarnRoll } from '../../../types';
import { Ionicons } from '@expo/vector-icons';

/**
 * Move LOT Screen
 * 
 * Workers and Supervisors can move lots.
 * - Enter on destination location auto-selects first matching suggestion.
 * - Creates MOVE audit record with yarn_code and from/to location snapshots.
 * - Shows confirmation modal before executing the move.
 */
export default function MoveYarnScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  // Using router object from expo-router
  const router = useRouter();

  const [yarn, setYarn] = useState<YarnRoll | null>(null);
  const [allAreas, setAllAreas] = useState<Area[]>([]);
  const [filteredAreas, setFilteredAreas] = useState<Area[]>([]);
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null);
  const [areaFilter, setAreaFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  const destinationInputRef = useRef<TextInput>(null);

  useEffect(() => {
    async function loadData() {
      // Fetch the lot being moved with its current area.
      const { data: yarnData } = await supabase
        .from('yarn_rolls')
        .select('id, yarn_code, area_id, status, updated_at, areas(id, code, label, is_active)')
        .eq('id', id)
        .single();

      // Fetch all active areas
      const { data: areaData } = await supabase
        .from('areas')
        .select('*')
        .eq('is_active', true)
        .order('code');

      const available = (areaData || []).filter((a: Area) => a.id !== yarnData?.area_id);

      setYarn(yarnData as unknown as YarnRoll);
      setAllAreas(available);
      setFilteredAreas(available);
      setLoading(false);
    }
    loadData();
  }, [id]);

  function handleAreaFilter(text: string) {
    setAreaFilter(text);
    const q = text.trim().toUpperCase();
    setFilteredAreas(q ? allAreas.filter((a) => a.code.toUpperCase().startsWith(q)) : allAreas);
  }

  // Enter key: auto-select first matching suggestion
  function handleDestinationSubmit() {
    if (filteredAreas.length > 0 && !selectedAreaId) {
      const first = filteredAreas[0];
      setSelectedAreaId(first.id);
      handleAreaFilter(first.code);
    }
  }

  function cleanLot(code: string) {
    return code.replace(/-\d+$/, '');
  }

  const selectedAreaCode = allAreas.find((a) => a.id === selectedAreaId)?.code;

  async function handleConfirmMove() {
    if (!selectedAreaId || !yarn) return;
    setSaving(true);
    setIsConfirming(false);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const operatorEmail = user?.email || 'Operator';
      const currentAreaCode = (yarn as any).areas?.code || 'Unknown';

      // Log the MOVE audit record with full details
      const { error: logError } = await supabase.from('move_logs').insert({
        yarn_roll_id: yarn.id,
        action: 'MOVE',
        yarn_code: yarn.yarn_code,
        from_area_code: currentAreaCode,
        to_area_code: selectedAreaCode,
        from_area_id: yarn.area_id,
        to_area_id: selectedAreaId,
        moved_by: user?.id,
        note: JSON.stringify({
          action: 'MOVE',
          operator: operatorEmail,
          details: `Moved from ${currentAreaCode} to ${selectedAreaCode}`,
        }),
      });

      if (logError) {
        Alert.alert('Error', 'Failed to log the move. Please try again.');
        setSaving(false);
        return;
      }

      // Update the lot's location
      const { error: updateError } = await supabase
        .from('yarn_rolls')
        .update({ area_id: selectedAreaId, updated_at: new Date().toISOString() })
        .eq('id', yarn.id);

      setSaving(false);

      if (updateError) {
        Alert.alert('Error', 'Move logged but position update failed. Contact admin.');
        return;
      }

      // Auto-navigate back to Board
      router.replace('/');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'An unexpected error occurred.');
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1b4d3e" />
      </View>
    );
  }

  if (!yarn) {
    return (
      <View style={styles.centered}>
        <Ionicons name="alert-circle-outline" size={48} color="#cbd5e1" />
        <Text style={styles.notFound}>LOT not found.</Text>
      </View>
    );
  }

  const currentAreaCode = (yarn as any).areas?.code ?? 'Unknown';

  const now = new Date();
  const formattedDate = `${String(now.getDate()).padStart(2, '0')} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][now.getMonth()]} ${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  return (
    <View style={styles.container}>
      {/* Banner: current lot info */}
      <View style={styles.yarnInfoBanner}>
        <View>
          <Text style={styles.bannerLotCode}>LOT: {cleanLot(yarn.yarn_code)}</Text>
          <View style={styles.currentAreaRow}>
            <Ionicons name="location" size={13} color="#a7f3d0" style={{ marginRight: 4 }} />
            <Text style={styles.currentAreaText}>Currently at: {currentAreaCode}</Text>
          </View>
        </View>
        <View style={styles.arrowIcon}>
          <Ionicons name="swap-horizontal" size={24} color="#a7f3d0" />
        </View>
      </View>

      {/* Instruction row */}
      <View style={styles.instructionRow}>
        <Text style={styles.instruction}>Select destination</Text>
        <Text style={styles.areaCount}>{filteredAreas.length} available</Text>
      </View>

      {/* Filter input */}
      <View style={styles.fieldCard}>
        <Text style={styles.fieldLabel}>
          <Ionicons name="location-outline" size={13} color="#1b4d3e" />{'  '}Destination Location
        </Text>
        <View style={styles.inputWrapper}>
          <TextInput
            ref={destinationInputRef}
            style={styles.input}
            placeholder="Type to filter"
            value={areaFilter}
            onChangeText={(text) => {
              handleAreaFilter(text);
              if (selectedAreaId) setSelectedAreaId(null);
            }}
            autoCapitalize="characters"
            placeholderTextColor="#a0aec0"
            returnKeyType="done"
            onSubmitEditing={handleDestinationSubmit}
          />
          {areaFilter.length > 0 && (
            <TouchableOpacity onPress={() => { handleAreaFilter(''); setSelectedAreaId(null); }} style={{ padding: 4 }}>
              <Ionicons name="close-circle" size={18} color="#94a3b8" />
            </TouchableOpacity>
          )}
        </View>

        {selectedAreaId && (
          <View style={styles.statusRow}>
            <Ionicons name="checkmark-circle-outline" size={13} color="#2e7d32" />
            <Text style={styles.statusTextOk}>{selectedAreaCode} selected</Text>
          </View>
        )}

        {areaFilter.trim().length > 0 && !selectedAreaId && filteredAreas.length > 0 && (
          <View style={styles.suggestionsContainer}>
            <FlatList
              data={filteredAreas.slice(0, 20)}
              keyExtractor={(item) => item.id}
              scrollEnabled={true}
              style={{ maxHeight: 200 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.suggestionItem}
                  onPress={() => {
                    setSelectedAreaId(item.id);
                    handleAreaFilter(item.code);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.suggestionCode}>{item.code}</Text>
                  {item.label ? (
                    <Text style={styles.suggestionLabel}>{item.label}</Text>
                  ) : null}
                </TouchableOpacity>
              )}
            />
            {filteredAreas.length > 20 && (
              <Text style={styles.suggestionsMore}>+{filteredAreas.length - 20} more — type more to narrow</Text>
            )}
          </View>
        )}

        {areaFilter.trim().length > 0 && filteredAreas.length === 0 && (
          <Text style={styles.noSuggestionsText}>No locations matching "{areaFilter.trim().toUpperCase()}"</Text>
        )}
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        {selectedAreaCode && (
          <View style={styles.selectionPreview}>
            <Ionicons name="navigate" size={14} color="#1b4d3e" style={{ marginRight: 6 }} />
            <Text style={styles.selectionPreviewText}>
              Moving to <Text style={styles.selectionPreviewCode}>{selectedAreaCode}</Text>
            </Text>
          </View>
        )}
        <TouchableOpacity
          style={[styles.confirmButton, (!selectedAreaId || saving) && styles.confirmButtonDisabled]}
          onPress={() => selectedAreaId && setIsConfirming(true)}
          disabled={!selectedAreaId || saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="swap-horizontal" size={18} color="#ffffff" style={{ marginRight: 8 }} />
              <Text style={styles.confirmButtonText}>{selectedAreaId ? `Move to ${selectedAreaCode}` : 'Select a location'}</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Confirmation Modal */}
      <Modal
        visible={isConfirming}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsConfirming(false)}
      >
        <View style={styles.overlay}>
          <View style={styles.confirmCard}>
            <View style={styles.confirmIconRow}>
              <View style={styles.confirmIconBg}>
                <Ionicons name="swap-horizontal" size={28} color="#1b4d3e" />
              </View>
            </View>
            <Text style={styles.confirmTitle}>Confirm Move</Text>
            <Text style={styles.confirmSubtitle}>Please verify the move details:</Text>
            <View style={styles.confirmDetails}>
              <View style={styles.confirmRow}>
                <Text style={styles.confirmLabel}>LOT Number</Text>
                <Text style={styles.confirmValue}>{cleanLot(yarn.yarn_code)}</Text>
              </View>
              <View style={styles.confirmDivider} />
              <View style={styles.confirmRow}>
                <Text style={styles.confirmLabel}>From</Text>
                <Text style={styles.confirmLocation}>{currentAreaCode}</Text>
              </View>
              <View style={styles.confirmDivider} />
              <View style={styles.confirmRow}>
                <Text style={styles.confirmLabel}>To</Text>
                <Text style={[styles.confirmLocation, styles.confirmLocationDest]}>{selectedAreaCode}</Text>
              </View>
              <View style={styles.confirmDivider} />
              <View style={styles.confirmRow}>
                <Text style={styles.confirmLabel}>Date/Time</Text>
                <Text style={styles.confirmValue}>{formattedDate}</Text>
              </View>
            </View>
            <View style={styles.confirmActions}>
              <TouchableOpacity style={styles.btnCancel} onPress={() => setIsConfirming(false)}>
                <Text style={styles.btnCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnConfirm} onPress={handleConfirmMove} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.btnConfirmText}>Confirm Move</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  notFound: { color: '#94a3b8', fontSize: 16, fontWeight: '600' },
  yarnInfoBanner: { backgroundColor: '#1b4d3e', paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bannerLotCode: { fontSize: 20, fontWeight: '900', color: '#ffffff', letterSpacing: 0.5 },
  currentAreaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  currentAreaText: { fontSize: 13, color: '#a7f3d0', fontWeight: '600' },
  arrowIcon: { backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 10, padding: 8 },
  instructionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingTop: 12, paddingBottom: 6 },
  instruction: { fontSize: 13, fontWeight: '700', color: '#475569' },
  areaCount: { fontSize: 12, color: '#94a3b8', fontWeight: '500' },
  fieldCard: { backgroundColor: '#ffffff', marginHorizontal: 14, borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#e2e8f0', shadowColor: '#1b4d3e', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.03, shadowRadius: 3, elevation: 2 },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: '#475569', marginBottom: 8 },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: '#cbd5e1', borderRadius: 8, paddingHorizontal: 10, backgroundColor: '#f8fafc' },
  input: { flex: 1, fontSize: 14, color: '#0f172a', paddingVertical: 10 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6, paddingHorizontal: 4 },
  statusTextOk: { fontSize: 11, fontWeight: '600', color: '#2e7d32' },
  suggestionsContainer: { marginTop: 6, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, backgroundColor: '#fff', overflow: 'hidden' },
  suggestionItem: { paddingHorizontal: 12, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  suggestionCode: { fontSize: 14, fontWeight: '700', color: '#1e293b' },
  suggestionLabel: { fontSize: 11, color: '#94a3b8', marginTop: 1 },
  suggestionsMore: { fontSize: 11, color: '#94a3b8', textAlign: 'center', paddingVertical: 6 },
  noSuggestionsText: { fontSize: 11, color: '#94a3b8', marginTop: 6, paddingLeft: 2 },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#ffffff', borderTopWidth: 1, borderTopColor: '#e2e8f0', padding: 14, gap: 8 },
  selectionPreview: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#e8f5e9', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 7 },
  selectionPreviewText: { fontSize: 13, color: '#475569', fontWeight: '500' },
  selectionPreviewCode: { color: '#1b4d3e', fontWeight: '800' },
  confirmButton: { backgroundColor: '#1b4d3e', borderRadius: 12, padding: 15, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
  confirmButtonDisabled: { backgroundColor: '#a3bda8' },
  confirmButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.7)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  confirmCard: { width: '100%', maxWidth: 320, backgroundColor: '#ffffff', borderRadius: 20, padding: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 12, elevation: 8 },
  confirmIconRow: { alignItems: 'center', marginBottom: 12 },
  confirmIconBg: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#e8f5e9', alignItems: 'center', justifyContent: 'center' },
  confirmTitle: { fontSize: 18, fontWeight: '800', color: '#1b5e20', textAlign: 'center', marginBottom: 4 },
  confirmSubtitle: { fontSize: 12, color: '#64748b', textAlign: 'center', marginBottom: 18 },
  confirmDetails: { backgroundColor: '#f8fafc', borderRadius: 10, padding: 14, borderWidth: 1, borderColor: '#e2e8f0', gap: 8 },
  confirmRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  confirmLabel: { fontSize: 12, color: '#64748b', fontWeight: '600' },
  confirmValue: { fontSize: 14, color: '#0f172a', fontWeight: '800' },
  confirmLocation: { fontSize: 13, color: '#64748b', fontWeight: '700', backgroundColor: '#f1f5f9', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 5, overflow: 'hidden' },
  confirmLocationDest: { color: '#1b5e20', backgroundColor: '#e8f5e9' },
  confirmDivider: { height: 1, backgroundColor: '#e2e8f0' },
  confirmActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 20 },
  btnCancel: { paddingVertical: 10, paddingHorizontal: 18, borderRadius: 8, backgroundColor: '#f1f5f9' },
  btnCancelText: { color: '#475569', fontSize: 13, fontWeight: '700' },
  btnConfirm: { paddingVertical: 10, paddingHorizontal: 18, borderRadius: 8, backgroundColor: '#1b4d3e', minWidth: 120, alignItems: 'center' },
  btnConfirmText: { color: '#ffffff', fontSize: 13, fontWeight: '700' },
});
