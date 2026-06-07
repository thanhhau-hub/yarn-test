import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, Alert, ActivityIndicator, TextInput, SafeAreaView, Switch } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useRole } from '../../hooks/useRole';
import { Ionicons } from '@expo/vector-icons';
import { Area } from '../../types';

/**
 * Supervisor Manage Areas screen.
 * Presented as a full-screen route (within the tabs group) with constrained max width.
 */
export default function ManageAreasScreen() {
  const { role, loading: roleLoading } = useRole();
  const router = useRouter();
  const [allAreas, setAllAreas] = useState<Area[]>([]);
  const [loadingAreas, setLoadingAreas] = useState(false);
  const [newAreaCode, setNewAreaCode] = useState('');
  const [savingArea, setSavingArea] = useState(false);

  const fetchAllAreas = useCallback(async () => {
    setLoadingAreas(true);
    const { data, error } = await supabase.from('areas').select('*').order('code');
    if (!error && data) setAllAreas(data as Area[]);
    setLoadingAreas(false);
  }, []);

  useEffect(() => {
    fetchAllAreas();
  }, [fetchAllAreas]);

  // Redirect workers away from this screen
  useEffect(() => {
    if (!roleLoading && role !== 'supervisor') {
      router.replace('/');
    }
  }, [roleLoading, role]);

  const handleAddArea = useCallback(async () => {
    if (!newAreaCode.trim()) {
      Alert.alert('Required', 'Please enter an Area Code.');
      return;
    }
    const code = newAreaCode.trim().toUpperCase();
    setSavingArea(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const operatorEmail = user?.email || 'Operator';
      const { data: newArea, error: insertError } = await supabase
        .from('areas')
        .insert({ code, is_active: true })
        .select()
        .single();
      if (insertError) {
        Alert.alert('Error', 'Failed to create area: ' + insertError.message);
        return;
      }
      await supabase.from('move_logs').insert({
        action: 'AREA_CREATE',
        moved_by: user?.id,
        note: JSON.stringify({ action: 'AREA_CREATE', operator: operatorEmail, details: `Created new storage location ${code}` }),
        to_area_code: code,
      });
      setNewAreaCode('');
      fetchAllAreas();
      router.replace('/');
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setSavingArea(false);
    }
  }, [newAreaCode, fetchAllAreas]);

  const handleToggleAreaActive = useCallback(async (areaItem: Area, value: boolean) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const operatorEmail = user?.email || 'Operator';
      const { error: updateError } = await supabase.from('areas').update({ is_active: value }).eq('id', areaItem.id);
      if (updateError) {
        Alert.alert('Error', 'Failed to toggle status: ' + updateError.message);
        return;
      }
      await supabase.from('move_logs').insert({
        action: value ? 'AREA_ENABLE' : 'AREA_DISABLE',
        moved_by: user?.id,
        note: JSON.stringify({ action: value ? 'AREA_ENABLE' : 'AREA_DISABLE', operator: operatorEmail, details: `${value ? 'Enabled' : 'Disabled'} area ${areaItem.code}` }),
        from_area_code: areaItem.code,
        to_area_code: areaItem.code,
      });
      fetchAllAreas();
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  }, [fetchAllAreas]);

  const renderArea = ({ item }: { item: Area }) => (
    <View style={styles.areaRow}>
      <View>
        <Text style={styles.areaCode}>{item.code}</Text>
        {item.label && <Text style={styles.areaLabel}>{item.label}</Text>}
      </View>
      <View style={styles.areaRowRight}>
        <Text style={[styles.activeStatusText, { color: item.is_active ? '#059669' : '#b91c1c' }]}>{item.is_active ? 'Active' : 'Disabled'}</Text>
        <Switch
          value={item.is_active}
          onValueChange={val => handleToggleAreaActive(item, val)}
          trackColor={{ false: '#cbd5e1', true: '#a7f3d0' }}
          thumbColor={item.is_active ? '#059669' : '#94a3b8'}
        />
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>📍 Area Management</Text>
          <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn}>
            <Ionicons name="close" size={24} color="#64748b" />
          </TouchableOpacity>
        </View>

        {/* Add Area Form */}
        <View style={styles.addAreaForm}>
          <Text style={styles.sectionTitle}>Create Storage Area</Text>
          <View style={styles.formRow}>
            <TextInput
              style={[styles.textInput, { flex: 1, marginRight: 8 }]}
              placeholder="Area Code (e.g. E1.5)"
              placeholderTextColor="#94a3b8"
              value={newAreaCode}
              onChangeText={setNewAreaCode}
              autoCapitalize="characters"
            />
            <TouchableOpacity
              style={[styles.addAreaBtn, savingArea && styles.btnDisabled]}
              onPress={handleAddArea}
              disabled={savingArea}
            >
              {savingArea ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.addAreaBtnText}>Create</Text>}
            </TouchableOpacity>
          </View>
        </View>

        {/* List of Areas */}
        <Text style={styles.listSectionTitle}>Existing Locations</Text>
        {loadingAreas ? (
          <ActivityIndicator style={{ marginTop: 24 }} size="large" color="#1b4d3e" />
        ) : (
          <FlatList data={allAreas} keyExtractor={item => item.id} renderItem={renderArea} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }} />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#e2e8f0', alignItems: 'center' },
  container: {
    flex: 1,
    width: '100%',
    maxWidth: 500,
    backgroundColor: '#fff',
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 5,
    overflow: 'hidden',
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { fontSize: 20, fontWeight: '800', color: '#1b4d3e' },
  closeBtn: { padding: 4 },
  addAreaForm: { marginBottom: 20 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#475569', marginBottom: 8 },
  formRow: { flexDirection: 'row', alignItems: 'center' },
  textInput: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, paddingHorizontal: 8, backgroundColor: '#f8fafc', height: 36 },
  addAreaBtn: { backgroundColor: '#1b4d3e', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  addAreaBtnText: { color: '#fff', fontWeight: '600' },
  btnDisabled: { opacity: 0.5 },
  listSectionTitle: { fontSize: 16, fontWeight: '700', color: '#475569', marginBottom: 8 },
  areaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  areaCode: { fontSize: 14, fontWeight: '800', color: '#1e293b' },
  areaLabel: { fontSize: 12, color: '#94a3b8', marginTop: 2 },
  areaRowRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  activeStatusText: { fontSize: 12, fontWeight: '600' },
});
