import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, TextInput, ScrollView, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { createClient } from '@supabase/supabase-js';
import { useRole } from '../../hooks/useRole';
import { Ionicons } from '@expo/vector-icons';
import { Profile } from '../../types';

// We create a separate client for signup to avoid logging out the current admin session
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

const adminAuthClient = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  }
);

export default function AdminScreen() {
  const { role, loading: roleLoading } = useRole();
  const insets = useSafeAreaInsets();
  
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);
  
  // New User Form State
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'worker' | 'supervisor' | 'admin'>('worker');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (role === 'admin') {
      fetchProfiles();
    }
  }, [role]);

  async function fetchProfiles() {
    setLoading(true);
    const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
    if (data) setProfiles(data);
    setLoading(false);
  }

  async function handleCreateUser() {
    if (!newEmail.trim() || !newPassword) {
      Alert.alert('Missing Fields', 'Please fill in all fields.');
      return;
    }
    
    setCreating(true);
    try {
      // Create user using the separate client
      const { data, error } = await adminAuthClient.auth.signUp({
        email: newEmail.trim(),
        password: newPassword,
        options: {
          data: {
            role: newRole,
          }
        }
      });

      if (error) {
        Alert.alert('Creation Failed', error.message);
        setCreating(false);
        return;
      }

      const newUserId = data.user?.id;
      
      // Attempt to immediately update the profile role if the trigger didn't pick it up
      if (newUserId) {
        // Wait a second for trigger to complete
        await new Promise(res => setTimeout(res, 1000));
        await supabase.from('profiles').update({ role: newRole }).eq('id', newUserId);
      }

      Alert.alert('Success', 'User account created successfully!');
      setNewEmail('');
      setNewPassword('');
      setNewRole('worker');
      fetchProfiles();
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setCreating(false);
    }
  }

  async function handleChangeRole(id: string, nextRole: 'worker' | 'supervisor' | 'admin') {
    setLoading(true);
    const { error } = await supabase.from('profiles').update({ role: nextRole }).eq('id', id);
    if (error) Alert.alert('Error', error.message);
    else fetchProfiles();
    setLoading(false);
  }

  async function handleDeleteAccount(id: string) {
    Alert.alert('Confirm Delete', 'Are you sure you want to delete this account profile?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
          setLoading(true);
          const { error } = await supabase.from('profiles').delete().eq('id', id);
          if (error) Alert.alert('Error', error.message);
          else fetchProfiles();
          setLoading(false);
        }
      }
    ]);
  }

  if (roleLoading) return <View style={styles.center}><ActivityIndicator size="large" color="#1b4d3e" /></View>;
  if (role !== 'admin') {
    return <View style={styles.center}><Text>Access Denied. Admins only.</Text></View>;
  }

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Account Management</Text>
      </View>

      <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
        {/* Create User Form */}
        <View style={styles.createCard}>
          <Text style={styles.cardTitle}>Create New Account</Text>
          
          <View style={styles.inputGroup}>
            <TextInput style={styles.input} placeholder="Email" value={newEmail} onChangeText={setNewEmail} keyboardType="email-address" autoCapitalize="none" />
            <TextInput style={styles.input} placeholder="Password" value={newPassword} onChangeText={setNewPassword} secureTextEntry />
          </View>

          <Text style={styles.roleLabel}>Select Role:</Text>
          <View style={styles.roleSelector}>
            {(['worker', 'supervisor', 'admin'] as const).map(r => (
              <TouchableOpacity
                key={r}
                style={[styles.roleSelectBtn, newRole === r && styles.roleSelectBtnActive]}
                onPress={() => setNewRole(r)}
              >
                <Text style={[styles.roleSelectText, newRole === r && styles.roleSelectTextActive]}>{r}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={styles.createBtn} onPress={handleCreateUser} disabled={creating}>
            {creating ? <ActivityIndicator color="#fff" /> : <Text style={styles.createBtnText}>Create Account</Text>}
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>Existing Users</Text>
        
        {loading && profiles.length === 0 ? (
           <ActivityIndicator size="small" color="#1b4d3e" style={{ marginVertical: 20 }} />
        ) : (
          profiles.map(p => (
            <View key={p.id} style={styles.listItem}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemTitle}>{p.full_name || 'No Name'} ({p.role})</Text>
                <Text style={styles.itemSub}>{p.email}</Text>
                
                <View style={styles.roleActions}>
                   {(['worker', 'supervisor', 'admin'] as const).map(r => (
                      <TouchableOpacity 
                        key={r} 
                        style={[styles.roleBtnSmall, p.role === r && styles.roleBtnSmallActive]} 
                        onPress={() => handleChangeRole(p.id, r)}
                        disabled={loading || p.role === r}
                      >
                        <Text style={[styles.roleBtnTextSmall, p.role === r && styles.roleBtnTextSmallActive]}>{r}</Text>
                      </TouchableOpacity>
                   ))}
                </View>
              </View>
              <TouchableOpacity style={styles.iconBtn} onPress={() => handleDeleteAccount(p.id)}>
                <Ionicons name="trash" size={18} color="#c62828" />
              </TouchableOpacity>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { padding: 16, backgroundColor: '#1b4d3e' },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '800' },
  content: { padding: 16 },
  
  createCard: { backgroundColor: '#fff', padding: 16, borderRadius: 12, marginBottom: 24, borderWidth: 1, borderColor: '#e2e8f0', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#1e293b', marginBottom: 12 },
  inputGroup: { gap: 10, marginBottom: 16 },
  input: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 12, fontSize: 14, backgroundColor: '#f8fafc' },
  roleLabel: { fontSize: 13, fontWeight: '600', color: '#475569', marginBottom: 8 },
  roleSelector: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  roleSelectBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8, borderWidth: 1, borderColor: '#cbd5e1', backgroundColor: '#f8fafc' },
  roleSelectBtnActive: { borderColor: '#1b4d3e', backgroundColor: '#e8f5e9' },
  roleSelectText: { fontSize: 13, color: '#64748b', textTransform: 'capitalize', fontWeight: '500' },
  roleSelectTextActive: { color: '#1b4d3e', fontWeight: 'bold' },
  createBtn: { backgroundColor: '#1b4d3e', padding: 14, borderRadius: 8, alignItems: 'center' },
  createBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1e293b', marginBottom: 12 },
  listItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', padding: 16, borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: '#e2e8f0' },
  itemTitle: { fontSize: 15, fontWeight: '700', color: '#1e293b' },
  itemSub: { fontSize: 13, color: '#64748b', marginTop: 2, marginBottom: 8 },
  roleActions: { flexDirection: 'row', gap: 6 },
  roleBtnSmall: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 6, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#f8fafc' },
  roleBtnSmallActive: { borderColor: '#1b4d3e', backgroundColor: '#e8f5e9' },
  roleBtnTextSmall: { fontSize: 12, color: '#64748b', textTransform: 'capitalize' },
  roleBtnTextSmallActive: { color: '#1b4d3e', fontWeight: 'bold' },
  iconBtn: { padding: 8, backgroundColor: '#fee2e2', borderRadius: 6, marginLeft: 12 },
});
