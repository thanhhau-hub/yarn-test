import { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { Area } from '../../types';
import { Ionicons } from '@expo/vector-icons';
import { useRole } from '../../hooks/useRole';

/**
 * Add Lot Screen — Supervisor Only
 *
 * - Multiple lots per location are allowed (no empty/occupied restriction)
 * - Dropdown shows up to 5 suggestions, fully clickable
 * - Enter on location auto-selects first match
 * - Success modal with "Add Another" / "View Board"
 */
export default function AddScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ areaId?: string }>();
  const { role, loading: roleLoading } = useRole();

  const [lotNumber, setLotNumber] = useState('');
  const [locationQuery, setLocationQuery] = useState('');
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null);
  const [selectedAreaCode, setSelectedAreaCode] = useState<string>('');


  const [allAreas, setAllAreas] = useState<Area[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [lastRegistered, setLastRegistered] = useState<{ lot: string; area: string } | null>(null);

  const lotInputRef = useRef<TextInput>(null);

  // Load all active areas on focus
  async function loadAreas() {
    setLoading(true);
    const { data } = await supabase
      .from('areas')
      .select('*')
      .eq('is_active', true)
      .order('code');
    const areas = data || [];
    setAllAreas(areas);

    // Pre-select if areaId passed via params
    if (params.areaId) {
      const match = areas.find((a) => a.id === params.areaId);
      if (match) {
        setSelectedAreaId(match.id);
        setSelectedAreaCode(match.code);
        setLocationQuery(match.code);
      }
    }
    setLoading(false);
  }

  useFocusEffect(
    useCallback(() => {
      if (role === 'supervisor' || role === 'admin') loadAreas();
      setLotNumber('');
      setIsConfirming(false);
      setIsSuccess(false);
      if (!params.areaId) clearLocation();
    }, [params.areaId, role])
  );



  function selectArea(area: Area) {
    setSelectedAreaId(area.id);
    setSelectedAreaCode(area.code);
    setLocationQuery(area.code);

    setTimeout(() => lotInputRef.current?.focus(), 100);
  }

  function clearLocation() {
    setSelectedAreaId(null);
    setSelectedAreaCode('');
    setLocationQuery('');

  }

  function handleLocationSubmit() {
    const query = locationQuery.trim().toUpperCase();
    if (!selectedAreaId && query) {
      const match = allAreas.find((a) => a.code.toUpperCase() === query);
      if (match) {
        selectArea(match);
      } else {
        Alert.alert('Not Found', `Location "${query}" does not exist.`);
      }
    } else if (selectedAreaId) {
      lotInputRef.current?.focus();
    }
  }

  function handleInitSave() {
    const lot = lotNumber.trim().toUpperCase();
    if (!lot) {
      Alert.alert('Required', 'Please enter a LOT number.');
      return;
    }
    if (!selectedAreaId) {
      Alert.alert('Required', 'Please select a rack location.');
      return;
    }
    setIsConfirming(true);
  }

  async function handleConfirmSave() {
    const baseCode = lotNumber.trim().toUpperCase();
    setSaving(true);
    setIsConfirming(false);

    try {
      // Handle duplicate lot codes by appending suffix (only within the same location)
      let finalCode = baseCode;
      const { data: matches } = await supabase
        .from('yarn_rolls')
        .select('yarn_code')
        .eq('area_id', selectedAreaId)
        .ilike('yarn_code', `${baseCode}%`);

      if (matches && matches.length > 0) {
        const regex = new RegExp(`^${baseCode}(-\\d+)?$`);
        const matched = matches.map((m) => m.yarn_code).filter((c) => regex.test(c));
        if (matched.length > 0) {
          let maxIdx = 1;
          matched.forEach((c) => {
            if (c !== baseCode) {
              const idx = parseInt(c.split('-').pop() || '0', 10);
              if (!isNaN(idx)) maxIdx = Math.max(maxIdx, idx);
            }
          });
          finalCode = `${baseCode}-${maxIdx + 1}`;
        }
      }

      // Insert the new LOT
      const { data: newYarn, error: insertError } = await supabase
        .from('yarn_rolls')
        .insert({
          yarn_code: finalCode,
          area_id: selectedAreaId,
          status: 'in_stock',
        })
        .select()
        .single();

      if (insertError) {
        Alert.alert('Error', insertError.message);
        setSaving(false);
        return;
      }

      // Audit log
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from('move_logs').insert({
        yarn_roll_id: newYarn.id,
        action: 'CREATE',
        yarn_code: finalCode,
        from_area_code: null,
        to_area_code: selectedAreaCode,
        from_area_id: null,
        to_area_id: selectedAreaId,
        moved_by: user?.id,
        note: JSON.stringify({
          action: 'CREATE',
          operator: user?.email || 'Operator',
          details: `Created lot ${finalCode} at ${selectedAreaCode}`,
        }),
      });

      setSaving(false);
      setLastRegistered({ lot: baseCode, area: selectedAreaCode });
      setIsSuccess(true);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'An unexpected error occurred.');
      setSaving(false);
    }
  }

  // ─── Supervisor gate ────────────────────────────────────────────
  if (roleLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1b4d3e" />
      </View>
    );
  }

  if (role !== 'supervisor' && role !== 'admin') {
    return (
      <View style={styles.accessDeniedContainer}>
        <View style={styles.accessDeniedCard}>
          <Ionicons name="lock-closed" size={40} color="#dc2626" style={{ marginBottom: 12 }} />
          <Text style={styles.accessDeniedTitle}>Supervisor/Admin Access Required</Text>
          <Text style={styles.accessDeniedText}>
            Adding new lots is restricted to supervisors or admins.{'\n'}
            Please contact your supervisor or admin to register new inventory.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.headerCard}>
          <Ionicons name="cube-outline" size={28} color="#1b4d3e" />
          <Text style={styles.headerTitle}>Register New LOT</Text>
        </View>

        {/* Location Field */}
        <View style={styles.fieldCard}>
          <Text style={styles.fieldLabel}>
            <Ionicons name="location-outline" size={13} color="#1b4d3e" />
            {'  '}Location *
          </Text>
          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.input}
              placeholder="Type to filter"
              value={locationQuery}
              onChangeText={(text) => {
                setLocationQuery(text);
                if (selectedAreaCode && text !== selectedAreaCode) {
                  setSelectedAreaId(null);
                  setSelectedAreaCode('');
                }
              }}
              autoCapitalize="characters"
              placeholderTextColor="#a0aec0"
              returnKeyType="next"
              onSubmitEditing={handleLocationSubmit}
            />
            {locationQuery.length > 0 && (
              <TouchableOpacity onPress={clearLocation} style={{ padding: 4 }}>
                <Ionicons name="close-circle" size={18} color="#94a3b8" />
              </TouchableOpacity>
            )}
          </View>

          {/* Selected confirmation */}
          {selectedAreaId && (
            <View style={styles.selectedRow}>
              <Ionicons name="checkmark-circle" size={14} color="#059669" />
              <Text style={styles.selectedText}>{selectedAreaCode} selected</Text>
            </View>
          )}


        </View>

        {/* LOT Number Field */}
        <View style={styles.fieldCard}>
          <Text style={styles.fieldLabel}>
            <Ionicons name="barcode-outline" size={13} color="#1b4d3e" />
            {'  '}Lot Number *
          </Text>
          <View style={styles.inputWrapper}>
            <TextInput
              ref={lotInputRef}
              style={styles.input}
              placeholder="Enter LOT number"
              value={lotNumber}
              onChangeText={setLotNumber}
              autoCapitalize="characters"
              placeholderTextColor="#a0aec0"
              returnKeyType="done"
              onSubmitEditing={handleInitSave}
            />
          </View>
        </View>

        {/* Save Button */}
        <TouchableOpacity
          style={[styles.saveButton, (saving || loading) && styles.saveButtonDisabled]}
          onPress={handleInitSave}
          disabled={saving || loading}
          activeOpacity={0.85}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="save-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.saveButtonText}>Save</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* Confirm Modal */}
      <Modal
        visible={isConfirming}
        transparent
        animationType="fade"
        onRequestClose={() => setIsConfirming(false)}
      >
        <View style={styles.overlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalIconBg}>
              <Ionicons name="checkmark-circle-outline" size={36} color="#1b4d3e" />
            </View>
            <Text style={styles.modalTitle}>Confirm Registration</Text>
            <Text style={styles.modalSubtitle}>Please verify before saving:</Text>

            <View style={styles.detailBox}>
              <View style={styles.detailRow}>
                <View style={styles.detailLabelRow}>
                  <Ionicons name="location-outline" size={14} color="#64748b" />
                  <Text style={styles.detailLabel}>Location</Text>
                </View>
                <Text style={styles.detailValueGreen}>{selectedAreaCode}</Text>
              </View>
              <View style={styles.detailDivider} />
              <View style={styles.detailRow}>
                <View style={styles.detailLabelRow}>
                  <Ionicons name="barcode-outline" size={14} color="#64748b" />
                  <Text style={styles.detailLabel}>LOT Number</Text>
                </View>
                <Text style={styles.detailValue}>{lotNumber.trim().toUpperCase()}</Text>
              </View>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.btnSecondary} onPress={() => setIsConfirming(false)}>
                <Text style={styles.btnSecondaryText}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnPrimary} onPress={handleConfirmSave} disabled={saving}>
                {saving ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.btnPrimaryText}>Confirm & Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Success Modal */}
      <Modal
        visible={isSuccess}
        transparent
        animationType="fade"
        onRequestClose={() => setIsSuccess(false)}
      >
        <View style={styles.overlay}>
          <View style={styles.modalCard}>
            <View style={[styles.modalIconBg, { backgroundColor: '#d1fae5' }]}>
              <Ionicons name="checkmark-circle" size={36} color="#059669" />
            </View>
            <Text style={[styles.modalTitle, { color: '#059669' }]}>Registered!</Text>
            <Text style={styles.modalSubtitle}>
              LOT <Text style={{ fontWeight: '800', color: '#1b4d3e' }}>{lastRegistered?.lot}</Text>
              {' '}has been placed at{' '}
              <Text style={{ fontWeight: '800', color: '#1b4d3e' }}>{lastRegistered?.area}</Text>
            </Text>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.btnSecondary}
                onPress={() => {
                  setIsSuccess(false);
                  setLotNumber('');
                  clearLocation();
                  loadAreas();
                }}
              >
                <Text style={styles.btnSecondaryText}>Add Another</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.btnPrimary}
                onPress={() => {
                  setIsSuccess(false);
                  router.push('/');
                }}
              >
                <Text style={styles.btnPrimaryText}>View Board</Text>
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
  scrollContent: { padding: 16, paddingBottom: 48 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Access Denied
  accessDeniedContainer: {
    flex: 1, backgroundColor: '#f1f5f9',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  accessDeniedCard: {
    backgroundColor: '#ffffff', borderRadius: 20, padding: 32,
    alignItems: 'center', borderWidth: 1, borderColor: '#fecaca',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08, shadowRadius: 12, elevation: 4,
    maxWidth: 320, width: '100%',
  },
  accessDeniedTitle: {
    fontSize: 17, fontWeight: '800', color: '#dc2626',
    marginBottom: 10, textAlign: 'center',
  },
  accessDeniedText: {
    fontSize: 13, color: '#64748b', textAlign: 'center', lineHeight: 20,
  },

  // Header
  headerCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#e8f5e9', borderRadius: 12, padding: 14,
    marginBottom: 16, borderWidth: 1, borderColor: '#c8e6c9',
  },
  headerTitle: { fontSize: 15, fontWeight: '800', color: '#1b5e20' },

  // Field Card
  fieldCard: {
    backgroundColor: '#ffffff', borderRadius: 12, padding: 14,
    marginBottom: 14, borderWidth: 1, borderColor: '#e2e8f0',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04, shadowRadius: 4, elevation: 2,
  },
  fieldLabel: {
    fontSize: 12, fontWeight: '700', color: '#475569',
    marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5,
  },

  // Input wrapper — same style for both fields
  inputWrapper: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1.5, borderColor: '#cbd5e1',
    borderRadius: 10, paddingHorizontal: 12,
    backgroundColor: '#f8fafc', minHeight: 46,
  },
  input: {
    flex: 1, fontSize: 15, color: '#0f172a', paddingVertical: 10,
  },

  // Selected location indicator
  selectedRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 8, paddingHorizontal: 2,
  },
  selectedText: { fontSize: 12, fontWeight: '700', color: '#059669' },



  // Save Button
  saveButton: {
    backgroundColor: '#1b4d3e', borderRadius: 12, padding: 16,
    alignItems: 'center', justifyContent: 'center', flexDirection: 'row',
    marginTop: 4, shadowColor: '#1b4d3e',
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 5,
  },
  saveButtonDisabled: { backgroundColor: '#a3bda8', shadowOpacity: 0 },
  saveButtonText: { color: '#fff', fontSize: 15, fontWeight: '800' },

  // Modal shared
  overlay: {
    flex: 1, backgroundColor: 'rgba(15,23,42,0.7)',
    justifyContent: 'center', alignItems: 'center', padding: 20,
  },
  modalCard: {
    width: '100%', maxWidth: 340, backgroundColor: '#ffffff',
    borderRadius: 20, padding: 24, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2, shadowRadius: 16, elevation: 10,
  },
  modalIconBg: {
    width: 68, height: 68, borderRadius: 34, backgroundColor: '#e8f5e9',
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
  },
  modalTitle: {
    fontSize: 18, fontWeight: '800', color: '#1b5e20',
    textAlign: 'center', marginBottom: 6,
  },
  modalSubtitle: {
    fontSize: 13, color: '#64748b', textAlign: 'center',
    marginBottom: 20, lineHeight: 20,
  },

  // Detail box in confirm modal
  detailBox: {
    width: '100%', backgroundColor: '#f8fafc', borderRadius: 10,
    padding: 14, borderWidth: 1, borderColor: '#e2e8f0', gap: 10, marginBottom: 4,
  },
  detailRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  detailLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  detailLabel: { fontSize: 12, color: '#64748b', fontWeight: '600' },
  detailValueGreen: {
    fontSize: 14, color: '#1b5e20', fontWeight: '900',
    backgroundColor: '#e8f5e9', paddingHorizontal: 10, paddingVertical: 3,
    borderRadius: 6, borderWidth: 0.5, borderColor: '#a5d6a7', overflow: 'hidden',
  },
  detailValue: { fontSize: 14, color: '#0f172a', fontWeight: '800' },
  detailDivider: { height: 1, backgroundColor: '#e2e8f0' },

  // Modal action buttons
  modalActions: {
    flexDirection: 'row', justifyContent: 'flex-end',
    gap: 10, marginTop: 22, width: '100%',
  },
  btnSecondary: {
    paddingVertical: 11, paddingHorizontal: 20,
    borderRadius: 9, backgroundColor: '#f1f5f9',
  },
  btnSecondaryText: { color: '#475569', fontSize: 13, fontWeight: '700' },
  btnPrimary: {
    paddingVertical: 11, paddingHorizontal: 20,
    borderRadius: 9, backgroundColor: '#1b4d3e',
    minWidth: 120, alignItems: 'center',
  },
  btnPrimaryText: { color: '#ffffff', fontSize: 13, fontWeight: '700' },
});
