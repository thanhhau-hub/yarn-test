import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Alert,
  Platform,
  Modal,
  Animated,
  TextInput,
  ActivityIndicator,
  FlatList,
  SectionList,
  ScrollView,
  Switch,
} from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { supabase } from '../../lib/supabase';
import { useBoard } from '../../hooks/useBoard';
import { useRole } from '../../hooks/useRole';
import { useAuth } from '../../context/AuthContext';
import { AreaWithCount, Area, Profile } from '../../types';
import { Ionicons } from '@expo/vector-icons';

// Strip duplicate suffix to get base LOT code (K446-1 → K446).
// Only removes trailing "-<number>" to handle duplicate roll suffixes.
// Does NOT normalise "/" or "." — those are part of the real LOT code.
function cleanLotNumber(lot: string) {
  if (!lot) return '';
  return lot.replace(/-\d+$/, '');
}

// ─── Animated Rack Cell ────────────────────────────────────────
    const RackCell = React.memo(({ area, columnWidth, isMatched, isTargetArea, shouldDim, hasYarn, lots, onPress }: {
      area: AreaWithCount;
      columnWidth: number;
      isMatched: boolean;
      isTargetArea: boolean;
      shouldDim: boolean;
      hasYarn: boolean;
      lots: string[];
      onPress: () => void;
    }) => {
      const pulseAnim = useRef(new Animated.Value(0)).current;

      useEffect(() => {
        if (isMatched || isTargetArea) {
          Animated.loop(
            Animated.sequence([
              Animated.timing(pulseAnim, { toValue: 1, duration: 350, useNativeDriver: false }),
              Animated.timing(pulseAnim, { toValue: 0, duration: 350, useNativeDriver: false }),
            ]),
            { iterations: 6 }
          ).start();
        } else {
          pulseAnim.setValue(0);
        }
      }, [isMatched, isTargetArea]);

      const animBorderColor = pulseAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ['#2e7d32', '#76c442'],
      });
      const animBorderWidth = pulseAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [2, 3],
      });

      const isHighlighted = isMatched || isTargetArea;

      let cardBg = '#ffffff';
      let lotColor = hasYarn ? '#2e7d32' : '#cbd5e1';
      let locColor = '#64748b';
      let borderColor = hasYarn ? '#c8e6c9' : '#e2e8f0';

      if (isHighlighted) {
        cardBg = '#e8f5e9';
        lotColor = '#1b5e20';
        locColor = '#2e7d32';
        borderColor = '#2e7d32';
      }

      return (
        <Animated.View
          style={[
            styles.rackCell,
            {
              width: columnWidth,
              height: columnWidth,
              backgroundColor: cardBg,
              borderColor: isHighlighted ? animBorderColor : borderColor,
              borderWidth: isHighlighted ? animBorderWidth : 1,
              opacity: shouldDim ? 0.2 : 1.0,
            },
            isHighlighted && styles.highlightedCell,
          ]}
        >
          <TouchableOpacity
            style={styles.rackCellTouchable}
            onPress={onPress}
            activeOpacity={0.6}
          >
            <Text style={[styles.cellLocation, { color: locColor }]} numberOfLines={1}>
              {area.code}
            </Text>
            {hasYarn && lots.length > 0 ? (
              <View style={styles.lotsWrapper}>
                <View style={styles.lotRow}>
                  {lots.slice(0, 2).map((lot, idx) => (
                    <View key={idx} style={styles.lotItem}>
                      <Text
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.6}
                        style={[styles.cellLotGrid, { color: lotColor, fontWeight: '800' }]}
                      >
                        {lot}
                      </Text>
                    </View>
                  ))}
                </View>
                {lots.length > 2 && (
                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.6}
                    style={[styles.cellLotPlus, { color: lotColor, fontWeight: '800' }]}
                  >
                    +{lots.length - 2}
                  </Text>
                )}
              </View>
            ) : (
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.6}
                style={[styles.cellLot, { color: lotColor, fontWeight: '400' }]}
              >
                —
              </Text>
            )}
          </TouchableOpacity>
        </Animated.View>
      );
    });
// ─── Board Screen ──────────────────────────────────────────────
function BoardScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ openAreaId?: string; searchLot?: string }>();
  const { session, isGuest, setGuestMode } = useAuth();
  const { areas, loading, error, refetch } = useBoard(session);
  const { role, loading: roleLoading } = useRole();
  const sectionListRef = useRef<SectionList>(null);
  const insets = useSafeAreaInsets();

  const searchLot = params.searchLot;
  const openAreaId = params.openAreaId;

  const [searchLotInput, setSearchLotInput] = useState('');
  const [searchColorInput, setSearchColorInput] = useState('');
  const [searchDescInput, setSearchDescInput] = useState('');
  const [containerWidth, setContainerWidth] = useState<number | null>(null);

  // Responsive grid based on screen width
  const [numColumns, setNumColumns] = useState(4);
  const [columnWidth, setColumnWidth] = useState(65);
  // Ref mirrors columnWidth so getItemLayout (called outside render) always has current value
  const columnWidthRef = useRef(65);
  const numColumnsRef = useRef(4);

  // Supervisor Panels State
  // Removed showAreaMgmt state (Worker role should not access Manage Areas)
  const [showUserMgmt, setShowUserMgmt] = useState(false);
  const [editingYarn, setEditingYarn] = useState<any>(null);
  const [isEditingLot, setIsEditingLot] = useState(false);

  // Areas Management panel input
  const [showAreaMgmt, setShowAreaMgmt] = useState(false);
  const [newAreaCode, setNewAreaCode] = useState('');
  const [newAreaLabel, setNewAreaLabel] = useState('');
  const [savingArea, setSavingArea] = useState(false);
  const [allAreas, setAllAreas] = useState<Area[]>([]);
  const [loadingAreas, setLoadingAreas] = useState(false);

  const fetchAreasForMgmt = useCallback(async () => {
    setLoadingAreas(true);
    const { data, error } = await supabase.from('areas').select('*').order('code', { ascending: true });
    if (!error && data) setAllAreas(data);
    setLoadingAreas(false);
  }, []);

  useEffect(() => {
    if (showAreaMgmt) fetchAreasForMgmt();
  }, [showAreaMgmt]);

  const handleSaveArea = async () => {
    if (!newAreaCode.trim()) {
      Alert.alert('Missing Info', 'Area Code is required.');
      return;
    }
    setSavingArea(true);
    const { error } = await supabase.from('areas').insert({
      code: newAreaCode.trim().toUpperCase(),
      label: newAreaLabel.trim() || null,
    });
    setSavingArea(false);
    if (error) {
      Alert.alert('Error', error.message);
    } else {
      setNewAreaCode('');
      setNewAreaLabel('');
      fetchAreasForMgmt();
      Alert.alert('Success', 'Area created successfully!');
    }
  };

  const handleDeleteArea = async (areaId: string, areaCode: string) => {
    const { count } = await supabase.from('yarns').select('*', { count: 'exact', head: true }).eq('area_id', areaId);
    if (count && count > 0) {
      Alert.alert('Cannot Delete', `Area ${areaCode} still contains rolls. Must be completely empty to delete.`);
      return;
    }
    Alert.alert('Confirm Delete', `Are you sure you want to delete area ${areaCode}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
          const { error } = await supabase.from('areas').delete().eq('id', areaId);
          if (error) Alert.alert('Error', error.message);
          else {
            fetchAreasForMgmt();
            Alert.alert('Success', 'Area deleted successfully!');
          }
      }}
    ]);
  };

  // Users Management panel list
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [updatingRoleUserId, setUpdatingRoleUserId] = useState<string | null>(null);

  useEffect(() => {
    if (!containerWidth) return;
    const horizontalPadding = 24;
    const gap = 4;
    const availableWidth = containerWidth - horizontalPadding;

    // Fix cell size: min 75px, max 95px
    // Calculate how many columns fit at minimum 75px per cell
    const MIN_CELL = 75;
    const MAX_CELL = 95;

    const maxCols = Math.floor((availableWidth + gap) / (MIN_CELL + gap));
    const cols = Math.max(2, maxCols); // at least 2 columns

    const calculatedWidth = (availableWidth - (cols - 1) * gap) / cols;
    // Clamp cell width between MIN and MAX
    const cellWidth = Math.min(MAX_CELL, Math.max(MIN_CELL, Math.floor(calculatedWidth)));

    setNumColumns(cols);
    setColumnWidth(cellWidth);
    columnWidthRef.current = cellWidth;
    numColumnsRef.current = cols;
  }, [containerWidth]);

  const onContainerLayout = (event: any) => {
    const { width } = event.nativeEvent.layout;
    if (width > 0 && width !== containerWidth) setContainerWidth(width);
  };

  // Modal state
  const [selectedArea, setSelectedArea] = useState<AreaWithCount | null>(null);
  const [cachedArea, setCachedArea] = useState<AreaWithCount | null>(null);
  const [areaToRestore, setAreaToRestore] = useState<AreaWithCount | null>(null);

  useEffect(() => {
    if (selectedArea) setCachedArea(selectedArea);
  }, [selectedArea]);

  const displayArea = selectedArea || cachedArea;

  const handleCloseModal = () => setSelectedArea(null);

  // Delete Confirmation State
  const [deleteConfirmYarn, setDeleteConfirmYarn] = useState<any>(null);
  const [deleteConfirmArea, setDeleteConfirmArea] = useState<string>('');
  const [isDeleting, setIsDeleting] = useState(false);

  // Note: fetchProfilesForMgmt is defined later with useCallback.

  useEffect(() => {
    if (showUserMgmt) {
      fetchProfilesForMgmt();
    }
  }, [showUserMgmt]);

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch])
  );

  // Logout
  async function handleLogout() {
    const performSignOut = async () => {
      try {
        // Clear guest mode first (no-op if not guest)
        await setGuestMode(false);
        if (session) {
          await supabase.auth.signOut();
        }
        router.replace('/login');
      } catch {
        Alert.alert('Error', 'Failed to sign out. Please try again.');
      }
    };
    if (Platform.OS === 'web') {
      if (window.confirm('Are you sure you want to sign out?')) await performSignOut();
    } else {
      Alert.alert('Logout', 'Are you sure you want to sign out?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Logout', style: 'destructive', onPress: performSignOut },
      ]);
    }
  }

  // Sort areas numerically
  const sortedAreas = useMemo(() => {
    return [...areas].sort((a, b) => {
      const secA = a.code[0];
      const secB = b.code[0];
      if (secA !== secB) return secA.localeCompare(secB);
      // Split by dot, slash, or hyphen to support multiple formats (e.g., D14.1, D14/1, D14-1)
      const restA = a.code.substring(1).split(/[.\/-]/);
      const restB = b.code.substring(1).split(/[.\/-]/);
      const rowA = parseInt(restA[0], 10) || 0;
      const rowB = parseInt(restB[0], 10) || 0;
      if (rowA !== rowB) return rowA - rowB;
      return (parseInt(restA[1], 10) || 0) - (parseInt(restB[1], 10) || 0);
    });
  }, [areas]);

  // Group into sections + grid rows
  const groupedSectionsForList = useMemo(() => {
    const groups: { [key: string]: AreaWithCount[] } = { A: [], B: [], C: [], D: [] };
    sortedAreas.forEach((area) => {
      const section = area.code[0].toUpperCase();
      if (groups[section]) groups[section].push(area);
      else groups[section] = [area];
    });
    return Object.keys(groups)
      .filter((k) => groups[k].length > 0)
      .map((key) => {
        const flatList = groups[key];
        const rows: AreaWithCount[][] = [];
        for (let i = 0; i < flatList.length; i += numColumns) {
          rows.push(flatList.slice(i, i + numColumns));
        }
        return { key, title: `Rack ${key}`, data: rows, flatList };
      });
  }, [sortedAreas, numColumns]);

  // ── PREFIX-BASED search matching ──────────────────────────────
  const activeLot = searchLotInput.trim().toLowerCase();
  const activeColor = searchColorInput.trim().toLowerCase();
  const activeDesc = searchDescInput.trim().toLowerCase();
  const isSearchActive = activeLot.length > 0 || activeColor.length > 0 || activeDesc.length > 0;

  const isCardMatched = useCallback(
    (area: AreaWithCount) => {
      if (!isSearchActive) return false;
      return (
        area.yarns?.some((yarn: any) => {
          const lotMatches = !activeLot || cleanLotNumber(yarn.yarn_code).toLowerCase().startsWith(activeLot);
          const colorMatches = !activeColor || (yarn.color || '').toLowerCase().includes(activeColor);
          const descMatches = !activeDesc || (yarn.description || '').toLowerCase().includes(activeDesc);
          return lotMatches && colorMatches && descMatches;
        }) ?? false
      );
    },
    [isSearchActive, activeLot, activeColor, activeDesc]
  );

  // Keep track of the last target location for retry on failure
  const targetScrollLocation = useRef<{ sectionIndex: number; itemIndex: number } | null>(null);
  const searchScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Scroll to first match based on all conditions
  const handleSearchScroll = useCallback(
    (qLot: string, qColor: string, qDesc: string) => {
      if (containerWidth === null) return;
      const lot = qLot.trim().toLowerCase();
      const col = qColor.trim().toLowerCase();
      const des = qDesc.trim().toLowerCase();
      if (!lot && !col && !des) return;
      if (groupedSectionsForList.length === 0) return;

      const matchedArea = sortedAreas.find((area) =>
        area.yarns?.some((y: any) => {
          const lotMatches = !lot || cleanLotNumber(y.yarn_code).toLowerCase().startsWith(lot);
          const colorMatches = !col || (y.color || '').toLowerCase().includes(col);
          const descMatches = !des || (y.description || '').toLowerCase().includes(des);
          return lotMatches && colorMatches && descMatches;
        })
      );

      if (!matchedArea) return;

      for (let s = 0; s < groupedSectionsForList.length; s++) {
        const sec = groupedSectionsForList[s];
        const flatIdx = sec.flatList.findIndex((a) => a.id === matchedArea.id);
        if (flatIdx !== -1) {
          const rowIndex = Math.floor(flatIdx / numColumns);
          targetScrollLocation.current = { sectionIndex: s, itemIndex: rowIndex };
          if (searchScrollTimeoutRef.current) {
            clearTimeout(searchScrollTimeoutRef.current);
          }
          searchScrollTimeoutRef.current = setTimeout(() => {
            try {
              sectionListRef.current?.scrollToLocation({
                sectionIndex: s,
                itemIndex: rowIndex,
                viewPosition: 0,
                viewOffset: 30,
                animated: true,
              });
            } catch (e) {
              console.warn('Scroll failed:', e);
            }
          }, 300);
          break;
        }
      }
    },
    [groupedSectionsForList, numColumns, sortedAreas, containerWidth]
  );

  useEffect(() => {
    if (containerWidth !== null && searchLot && groupedSectionsForList.length > 0) {
      setSearchLotInput(searchLot);
      handleSearchScroll(searchLot, searchColorInput, searchDescInput);
    }
  }, [searchLot, groupedSectionsForList, containerWidth]);

  useEffect(() => {
    if (containerWidth !== null && openAreaId && groupedSectionsForList.length > 0) {
      const targetArea = sortedAreas.find((a) => a.id === openAreaId);
      if (targetArea) {
        setSelectedArea(targetArea);
        for (let s = 0; s < groupedSectionsForList.length; s++) {
          const sec = groupedSectionsForList[s];
          const flatIdx = sec.flatList.findIndex((a) => a.id === openAreaId);
          if (flatIdx !== -1) {
            const rowIndex = Math.floor(flatIdx / numColumns);
            targetScrollLocation.current = { sectionIndex: s, itemIndex: rowIndex };
            const timer = setTimeout(() => {
              try {
                sectionListRef.current?.scrollToLocation({
                  sectionIndex: s,
                  itemIndex: rowIndex,
                  viewPosition: 0,
                  viewOffset: 30,
                  animated: true,
                });
              } catch (e) {
                console.warn('Scroll failed:', e);
              }
            }, 400);
            return () => clearTimeout(timer);
          }
        }
      }
    }
  }, [openAreaId, groupedSectionsForList, numColumns, sortedAreas, containerWidth]);

  const handleClearSearch = () => {
    setSearchLotInput('');
    setSearchColorInput('');
    setSearchDescInput('');
    router.setParams({ searchLot: undefined, openAreaId: undefined });
  };

  // ── Delete Lot ─────────────────────────────────────────────────
  const confirmDeleteLot = (yarn: any, areaCode: string) => {
    if (role !== 'supervisor' && role !== 'admin') {
      Alert.alert('Permission Required', 'Only supervisors and admins can delete lots.');
      return;
    }
    setAreaToRestore(selectedArea);
    setSelectedArea(null);
    setTimeout(() => {
      setDeleteConfirmYarn(yarn);
      setDeleteConfirmArea(areaCode);
    }, 50);
  };

  const cancelDeleteLot = () => {
    setDeleteConfirmYarn(null);
    if (areaToRestore) {
      setTimeout(() => {
        setSelectedArea(areaToRestore);
        setAreaToRestore(null);
      }, 50);
    }
  };

  const executeDelete = async () => {
    if (!deleteConfirmYarn) return;
    if (role !== 'supervisor' && role !== 'admin') {
      Alert.alert('Permission Required', 'Only supervisors and admins can delete lots.');
      return;
    }
    setIsDeleting(true);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const operatorEmail = user?.email || 'Operator';

      // Insert audit record BEFORE deleting
      const { error: logErr } = await supabase.from('move_logs').insert({
        yarn_roll_id: deleteConfirmYarn.id,
        action: 'DELETE',
        yarn_code: deleteConfirmYarn.yarn_code,
        from_area_code: deleteConfirmArea,
        to_area_code: null,
        from_area_id: deleteConfirmYarn.area_id,
        to_area_id: null,
        moved_by: user?.id,
        note: JSON.stringify({
          action: 'DELETE',
          operator: operatorEmail,
          details: `Lot permanently deleted from floor`,
        }),
      });

      if (logErr) {
        Alert.alert('Error', 'Audit logging failed. Lot was not deleted. ' + logErr.message);
        setIsDeleting(false);
        return;
      }

      const { error: updateError } = await supabase
        .from('yarn_rolls')
        .delete()
        .eq('id', deleteConfirmYarn.id);

      if (updateError) {
        Alert.alert('Error', 'Delete operation failed: ' + updateError.message);
        setIsDeleting(false);
        return;
      }

      setDeleteConfirmYarn(null);
      setDeleteConfirmArea('');
      setAreaToRestore(null);
      handleCloseModal();
      refetch();
      Alert.alert('Success', 'Lot successfully deleted.');
    } catch (err: any) {
      Alert.alert('Error', 'An unexpected error occurred: ' + err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const fetchProfilesForMgmt = useCallback(async () => {
    setLoadingProfiles(true);
    const { data, error } = await supabase.from('profiles').select('*').order('email');
    if (!error && data) setProfiles(data);
    setLoadingProfiles(false);
  }, []);

  const handleToggleUserRole = useCallback(async (profileItem: Profile) => {
    if (role !== 'supervisor' && role !== 'admin') { Alert.alert('Permission Required', 'Not allowed.'); return; }
    const nextRole = profileItem.role === 'supervisor' ? 'worker' : 'supervisor';
    setUpdatingRoleUserId(profileItem.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const operatorEmail = user?.email || 'Operator';
      const { error: updateError } = await supabase.from('profiles').update({ role: nextRole }).eq('id', profileItem.id);
      if (updateError) { Alert.alert('Error', 'Failed to change role: ' + updateError.message); setUpdatingRoleUserId(null); return; }
      await supabase.from('move_logs').insert({
        action: 'ROLE_CHANGE',
        moved_by: user?.id,
        note: JSON.stringify({ action: 'ROLE_CHANGE', operator: operatorEmail, details: `Changed role of user "${profileItem.email}" to "${nextRole}"` }),
      });
      fetchProfilesForMgmt();
      Alert.alert('Success', `User role updated to ${nextRole}.`);
    } catch (err: any) { Alert.alert('Error', err.message); }
    finally { setUpdatingRoleUserId(null); }
  }, [role, fetchProfilesForMgmt]);

  // ── Edit Lot ───────────────────────────────────────────────────
  const executeEditLot = () => {
    setEditingYarn(null);
    setIsEditingLot(false);
  };

  // Stats
  const totalRacks = sortedAreas.length;
  const occupiedRacks = sortedAreas.filter((a) => (a.yarn_count ?? 0) > 0).length;

  return (
    <View style={styles.safeArea}>
      <View style={styles.container} onLayout={onContainerLayout}>

        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top }]}>
          <View style={styles.headerLeft}>
            <Text style={styles.headerTitle}>Rack Board</Text>
            <View style={styles.roleRow}>
              <Text style={styles.headerSub}>{occupiedRacks}/{totalRacks} occupied</Text>
              {role === 'supervisor' ? (
                <View style={[styles.roleBadge, styles.roleSupervisor]}>
                  <Text style={styles.roleBadgeText}>Supervisor Mode</Text>
                </View>
              ) : role === 'admin' ? (
                <View style={[styles.roleBadge, styles.roleAdmin]}>
                  <Text style={styles.roleBadgeText}>ADMIN MODE</Text>
                </View>
              ) : (
                <View style={[styles.roleBadge, styles.roleWorker]}>
                  <Text style={styles.roleBadgeText}>Worker Mode</Text>
                </View>
              )}
              {(role === 'supervisor' || role === 'admin') && (
                <TouchableOpacity style={styles.manageAreasBtn} onPress={() => setShowAreaMgmt(true)}>
                  <Ionicons name="location" size={12} color="#065f46" />
                  <Text style={styles.manageAreasBtnText}>Manage Areas</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} activeOpacity={0.8}>
            <Ionicons name="log-out-outline" size={15} color="#ffffff" />
            <Text style={styles.logoutButtonText}>Logout</Text>
          </TouchableOpacity>
        </View>



        {/* Real-time Search Bar */}
        <View style={styles.searchContainer}>
          <View style={styles.searchRow}>
            <View style={[styles.searchInputWrapper, { flex: 1 }]}>
              <Ionicons name="barcode-outline" size={14} color="#718096" style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Lot"
                value={searchLotInput}
                onChangeText={(t) => { setSearchLotInput(t); handleSearchScroll(t, searchColorInput, searchDescInput); }}
                autoCapitalize="characters"
                placeholderTextColor="#a0aec0"
              />
            </View>
            <View style={[styles.searchInputWrapper, { flex: 1, marginLeft: 6 }]}>
              <Ionicons name="color-palette-outline" size={14} color="#718096" style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Color"
                value={searchColorInput}
                onChangeText={(t) => { setSearchColorInput(t); handleSearchScroll(searchLotInput, t, searchDescInput); }}
                autoCapitalize="none"
                placeholderTextColor="#a0aec0"
              />
            </View>
            <View style={[styles.searchInputWrapper, { flex: 1, marginLeft: 6 }]}>
              <Ionicons name="text-outline" size={14} color="#718096" style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Desc"
                value={searchDescInput}
                onChangeText={(t) => { setSearchDescInput(t); handleSearchScroll(searchLotInput, searchColorInput, t); }}
                autoCapitalize="none"
                placeholderTextColor="#a0aec0"
              />
            </View>
            {isSearchActive && (
              <TouchableOpacity onPress={handleClearSearch} style={styles.searchClearBtn}>
                <Ionicons name="close-circle" size={18} color="#a7f3d0" />
              </TouchableOpacity>
            )}
          </View>
          {isSearchActive && (
            <Text style={styles.searchHint}>
              Filtering by: {activeLot ? `Lot: ${activeLot}  ` : ''}{activeColor ? `Color: ${activeColor}  ` : ''}{activeDesc ? `Desc: ${activeDesc}` : ''}
            </Text>
          )}
        </View>

        {/* Dense Rack Grid */}
        <SectionList
          ref={sectionListRef}
          sections={groupedSectionsForList}
          keyExtractor={(item, index) => index.toString()}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor="#1b4d3e" />}
          stickySectionHeadersEnabled={true}
          showsVerticalScrollIndicator={true}
          initialNumToRender={60}
          windowSize={21}
          maxToRenderPerBatch={50}
          // getItemLayout enables reliable scrollToLocation for ANY row, even un-rendered ones.
          // Heights: section header = 30px, each grid row = columnWidth + 2px (paddingVertical:1 x2)
          getItemLayout={(data, index) => {
            const SECTION_HEADER_HEIGHT = 30;
            const ROW_HEIGHT = columnWidthRef.current + 2; // paddingVertical:1 top+bottom

            // Build a flat map of all items across sections to find offset
            let offset = 0;
            let flatIndex = 0;
            for (const section of groupedSectionsForList) {
              // Section header
              if (flatIndex === index) {
                return { length: SECTION_HEADER_HEIGHT, offset, index };
              }
              offset += SECTION_HEADER_HEIGHT;
              flatIndex++;

              // Rows in this section
              for (let r = 0; r < section.data.length; r++) {
                if (flatIndex === index) {
                  return { length: ROW_HEIGHT, offset, index };
                }
                offset += ROW_HEIGHT;
                flatIndex++;
              }

              // Section footer (height is 0, but occupies 1 index slot)
              if (flatIndex === index) {
                return { length: 0, offset, index };
              }
              flatIndex++;
            }
            // Fallback (should not happen)
            return { length: ROW_HEIGHT, offset: 0, index };
          }}
          onScrollToIndexFailed={(info) => {
            // With getItemLayout this should rarely fire, but handle it gracefully
            const retry = () => {
              try {
                if (targetScrollLocation.current) {
                  sectionListRef.current?.scrollToLocation({
                    sectionIndex: targetScrollLocation.current.sectionIndex,
                    itemIndex: targetScrollLocation.current.itemIndex,
                    viewPosition: 0,
                    viewOffset: 30,
                    animated: false,
                  });
                }
              } catch (e) {}
            };
            // Retry twice: immediately then after render settles
            setTimeout(retry, 100);
            setTimeout(retry, 600);
          }}
          renderSectionHeader={({ section }) => {
            const sectionOccupied = section.flatList.filter(
              (a: AreaWithCount) => (a.yarn_count ?? 0) > 0
            ).length;
            return (
              <View style={styles.sectionHeader}>
                <View style={styles.sectionHeaderLeft}>
                  <View style={styles.sectionDot} />
                  <Text style={styles.sectionTitle}>Rack {section.key}</Text>
                </View>
                <Text style={styles.sectionCount}>
                  {sectionOccupied}/{section.flatList.length}
                </Text>
              </View>
            );
          }}
          renderItem={({ item }) => (
            <View style={styles.rowGrid}>
              {item.map((area: AreaWithCount) => {
                const activeYarns = area.yarns || [];
                const hasYarn = activeYarns.length > 0;
                const lots = hasYarn
                  ? activeYarns.map((y: any) => cleanLotNumber(y.yarn_code))
                  : [];
                const isMatched = isCardMatched(area);
                const isTargetArea = openAreaId === area.id;
                const shouldDim = isSearchActive && !isMatched;

                return (
                  <RackCell
                    key={area.id}
                    area={area}
                    columnWidth={columnWidth}
                    isMatched={isMatched}
                    isTargetArea={isTargetArea}
                    shouldDim={shouldDim}
                    hasYarn={hasYarn}
                    lots={lots}
                    onPress={() => {
                      if (hasYarn) {
                        setSelectedArea(area);
                      } else if (role === 'supervisor' || role === 'admin') {
                        // Navigate to Add tab with location pre-selected
                        router.push({ pathname: '/(tabs)/add', params: { areaId: area.id } });
                      } else {
                        Alert.alert('Supervisor Required', 'Adding new lots is restricted to supervisors only.');
                      }
                    }}
                  />
                );
              })}
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>
                {loading ? 'Loading board...' : error ? `Error loading data: ${error}` : 'No rack locations found.'}
              </Text>
            </View>
          }
        />

        {/* Lot Action Modal */}
        <Modal
          visible={selectedArea !== null}
          transparent={true}
          animationType="fade"
          onRequestClose={handleCloseModal}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContainer}>
              {/* Modal Header */}
              <View style={styles.modalHeader}>
                <View>
                  <Text style={styles.modalTitle}>{displayArea?.code}</Text>
                  <Text style={styles.modalSubtitle}>
                    {displayArea?.yarn_count
                      ? `${displayArea.yarn_count} LOT(s) stored`
                      : 'Empty rack'}
                  </Text>
                </View>
                <TouchableOpacity onPress={handleCloseModal} style={styles.closeModalButton}>
                  <Ionicons name="close" size={22} color="#64748b" />
                </TouchableOpacity>
              </View>

              {/* Lot Cards with Actions */}
              <ScrollView style={styles.modalScroll}>
                <View style={styles.modalContent}>
                  {displayArea?.yarns && displayArea.yarns.length > 0 ? (
                    displayArea.yarns.map((yarn) => {
                      const cleanedLot = cleanLotNumber(yarn.yarn_code);
                      return (
                        <View key={yarn.id} style={styles.lotDetailCard}>
                          <View style={styles.lotDetailHeader}>
                            <Ionicons name="cube-outline" size={16} color="#1b4d3e" />
                            <View style={{ flex: 1 }}>
                              <Text style={styles.lotDetailText}>LOT: {cleanedLot}</Text>
                              <Text style={styles.lotDetailSubText}>Status: {yarn.status}</Text>
                            </View>
                          </View>

                          <View style={styles.lotActions}>
                            {/* Move (Available to Supervisors) */}
                            {(role === 'supervisor' || role === 'admin') && (
                              <TouchableOpacity
                                style={styles.actionBtnPrimary}
                                onPress={() => {
                                  handleCloseModal();
                                  router.push(`/move/${yarn.id}`);
                                }}
                              >
                                <Ionicons name="swap-horizontal" size={14} color="#ffffff" />
                                <Text style={styles.actionBtnPrimaryText}>Move</Text>
                              </TouchableOpacity>
                            )}

                            {/* Delete (Supervisor only) */}
                            {(role === 'supervisor' || role === 'admin') && (
                              <TouchableOpacity
                                style={styles.actionBtnDelete}
                                onPress={() => confirmDeleteLot(yarn, displayArea?.code || '')}
                              >
                                <Ionicons name="trash-outline" size={14} color="#ffffff" />
                                <Text style={styles.actionBtnDeleteText}>Delete</Text>
                              </TouchableOpacity>
                            )}

                            {/* History */}
                            <TouchableOpacity
                              style={styles.actionBtnSecondary}
                              onPress={() => {
                                handleCloseModal();
                                router.push(`/yarn/${yarn.id}`);
                              }}
                            >
                              <Ionicons name="time-outline" size={14} color="#475569" />
                              <Text style={styles.actionBtnSecondaryText}>History</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      );
                    })
                  ) : (
                    <View style={styles.emptyRackContainer}>
                      <Ionicons name="cube-outline" size={36} color="#cbd5e1" />
                      <Text style={styles.emptyRackText}>This rack is empty</Text>
                      {(role === 'supervisor' || role === 'admin') && (
                        <TouchableOpacity
                          style={styles.addHereButton}
                          onPress={() => {
                            handleCloseModal();
                            router.push({
                              pathname: '/(tabs)/add',
                              params: { areaId: displayArea?.id },
                            });
                          }}
                        >
                          <Ionicons name="add-circle-outline" size={16} color="#fff" />
                          <Text style={styles.addHereButtonText}>Add Lot Here</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </View>
              </ScrollView>

              {/* Close footer */}
              <TouchableOpacity style={styles.modalCloseFooterBtn} onPress={handleCloseModal}>
                <Text style={styles.modalCloseFooterText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Delete Confirmation Modal */}
        <Modal
          visible={deleteConfirmYarn !== null}
          transparent={true}
          animationType="fade"
          onRequestClose={() => { if (!isDeleting) cancelDeleteLot(); }}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.confirmCard}>
              <View style={styles.confirmIconRow}>
                <View style={styles.confirmIconBgDelete}>
                  <Ionicons name="trash" size={28} color="#b91c1c" />
                </View>
              </View>

              <Text style={styles.confirmTitle}>Confirm Delete</Text>
              <Text style={styles.confirmSubtitle}>Are you sure you want to permanently delete this lot?</Text>

              <View style={styles.confirmDetails}>
                <View style={styles.confirmRow}>
                  <Text style={styles.confirmLabel}>LOT Number</Text>
                  <Text style={styles.confirmValue}>{cleanLotNumber(deleteConfirmYarn?.yarn_code || '')}</Text>
                </View>
                <View style={styles.confirmDivider} />
                <View style={styles.confirmRow}>
                  <Text style={styles.confirmLabel}>Location</Text>
                  <Text style={styles.confirmLocation}>{deleteConfirmArea}</Text>
                </View>
              </View>

              <View style={styles.confirmActions}>
                <TouchableOpacity
                  style={styles.btnCancel}
                  onPress={cancelDeleteLot}
                  disabled={isDeleting}
                >
                  <Text style={styles.btnCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.btnDeleteConfirm}
                  onPress={executeDelete}
                  disabled={isDeleting}
                >
                  {isDeleting ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.btnConfirmText}>Delete</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Edit Lot Modal (Supervisor Only) */}
        <Modal
          visible={editingYarn !== null}
          transparent={true}
          animationType="fade"
          onRequestClose={() => { if (!isEditingLot) setEditingYarn(null); }}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.editCard}>
              <Text style={styles.editModalTitle}>Edit Lot Details</Text>
              
              <View style={styles.fieldWrapper}>
                <Text style={styles.fieldLabel}>LOT CODE (Locked)</Text>
                <View style={styles.lockedInput}>
                  <Ionicons name="lock-closed" size={14} color="#94a3b8" style={{ marginRight: 6 }} />
                  <Text style={styles.lockedInputText}>{cleanLotNumber(editingYarn?.yarn_code || '')}</Text>
                </View>
              </View>

              <View style={styles.fieldWrapper}>
                <Text style={styles.fieldLabel}>STATUS</Text>
                <View style={styles.lockedInput}>
                  <Text style={styles.lockedInputText}>{editingYarn?.status || 'in_stock'}</Text>
                </View>
              </View>

              <View style={styles.confirmActions}>
                <TouchableOpacity
                  style={styles.btnCancel}
                  onPress={() => setEditingYarn(null)}
                  disabled={isEditingLot}
                >
                  <Text style={styles.btnCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.btnSaveEdit}
                  onPress={executeEditLot}
                  disabled={isEditingLot}
                >
                  {isEditingLot ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.btnConfirmText}>Save Details</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Manage Areas Full Screen Modal */}
        <Modal visible={showAreaMgmt} animationType="slide" onRequestClose={() => setShowAreaMgmt(false)}>
          <View style={styles.areaModalContainer}>
            <View style={styles.areaModalHeader}>
              <Text style={styles.areaModalTitle}>Manage Areas</Text>
              <TouchableOpacity onPress={() => setShowAreaMgmt(false)} style={styles.areaModalCloseBtn}>
                <Ionicons name="close" size={24} color="#ffffff" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.areaModalContent}>
              <View style={styles.areaFormCard}>
                <Text style={styles.areaFormTitle}>Create New Area / Rack</Text>
                <View style={styles.areaFormRow}>
                  <TextInput
                    style={styles.areaFormInputCode}
                    placeholder="Code (e.g. A1.1)"
                    value={newAreaCode}
                    onChangeText={setNewAreaCode}
                    autoCapitalize="characters"
                  />
                  <TextInput
                    style={styles.areaFormInputLabel}
                    placeholder="Label (Optional)"
                    value={newAreaLabel}
                    onChangeText={setNewAreaLabel}
                  />
                  <TouchableOpacity style={styles.areaFormBtn} onPress={handleSaveArea} disabled={savingArea}>
                    {savingArea ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.areaFormBtnText}>Add</Text>}
                  </TouchableOpacity>
                </View>
              </View>
              
              <Text style={styles.areaListTitle}>All Areas ({allAreas.length})</Text>
              {loadingAreas ? (
                <ActivityIndicator size="large" color="#1b4d3e" style={{ marginTop: 20 }} />
              ) : (
                <View style={styles.areaList}>
                  {allAreas.map(a => (
                    <View key={a.id} style={styles.areaListItem}>
                      <View>
                        <Text style={styles.areaItemCode}>{a.code}</Text>
                        {a.label && <Text style={styles.areaItemLabel}>{a.label}</Text>}
                      </View>
                      <TouchableOpacity onPress={() => handleDeleteArea(a.id, a.code)} style={styles.areaItemDeleteBtn}>
                        <Ionicons name="trash" size={16} color="#ef4444" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
            </ScrollView>
          </View>
        </Modal>

      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#1b4d3e' },
  container: { flex: 1, backgroundColor: '#f1f5f9' },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 8,
    backgroundColor: '#1b4d3e',
  },
  headerLeft: {},
  headerTitle: { fontSize: 16, fontWeight: '800', color: '#fff' },
  roleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  headerSub: { fontSize: 9, color: '#a7f3d0', fontWeight: '600' },
  roleBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  roleWorker: { backgroundColor: '#475569' },
  roleSupervisor: { backgroundColor: '#d97706' },
  roleAdmin: { backgroundColor: '#dc2626' },
  roleBadgeText: { color: '#ffffff', fontSize: 8, fontWeight: '800', textTransform: 'uppercase' },

  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  logoutButtonText: { color: '#ffffff', fontSize: 12, fontWeight: '700' },

  superActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#a7f3d0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  superActionBtnText: {
    color: '#047857',
    fontSize: 12,
    fontWeight: '700',
  },

  // Search
  searchContainer: {
    backgroundColor: '#1b4d3e',
    paddingHorizontal: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#143c30',
  },
  searchInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 8,
    paddingHorizontal: 8,
    height: 36,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchClearBtn: {
    padding: 4,
    marginLeft: 4,
  },
  searchIcon: { marginRight: 4 },
  searchInput: {
    flex: 1,
    fontSize: 12,
    color: '#1e293b',
    paddingVertical: 0,
    height: '100%',
  },
  searchClear: { padding: 4 },
  searchHint: {
    fontSize: 10,
    color: '#a7f3d0',
    marginTop: 5,
    fontWeight: '600',
    paddingLeft: 2,
  },

  // List
  listContent: { paddingBottom: 16, paddingLeft: 8, paddingRight: 16 },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', minHeight: 200 },
  emptyText: { color: '#64748b', fontSize: 14, textAlign: 'center' },

  // Section Header
  sectionHeader: {
    height: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    backgroundColor: '#e8f5e9',
  },
  sectionHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sectionDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#2e7d32' },
  sectionTitle: { fontSize: 13, fontWeight: '900', letterSpacing: 1, color: '#1b5e20' },
  sectionCount: { fontSize: 10, fontWeight: '700', color: '#2e7d32' },

  // Grid
  rowGrid: { flexDirection: 'row', gap: 4, paddingVertical: 1 },

  // Rack Cell
  rackCell: {
    borderRadius: 6,
    overflow: 'hidden',
    shadowColor: '#1b4d3e',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  rackCellTouchable: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 2,
    paddingVertical: 2,
  },
  highlightedCell: {
    shadowColor: '#2e7d32',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  cellLocation: { fontSize: 8, fontWeight: '700', letterSpacing: 0.3 },
  cellLot: { fontSize: 13, textAlign: 'center', marginTop: 1 },
  lotsWrapper: {
    alignItems: 'center',
    width: '100%',
    marginTop: 2,
  },
  lotRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 3,
    marginVertical: 1,
  },
  lotItem: {
    paddingHorizontal: 1,
  },
  cellLotGrid: {
    fontSize: 11.5,
    textAlign: 'center',
  },
  cellLotPlus: {
    fontSize: 10,
    textAlign: 'center',
    marginTop: 1,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContainer: {
    width: '90%',
    maxWidth: 380,
    maxHeight: '90%',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    backgroundColor: '#f8fafc',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  modalTitle: { fontSize: 17, fontWeight: '800', color: '#1b5e20' },
  modalSubtitle: { fontSize: 10, color: '#64748b', marginTop: 2 },
  closeModalButton: { padding: 4 },
  modalScroll: { maxHeight: 520 },
  modalContent: { padding: 12 },

  // Lot detail card
  lotDetailCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 8,
    gap: 10,
  },
  lotDetailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  lotDetailText: { fontSize: 16, fontWeight: '800', color: '#1e293b' },
  lotDetailSubText: { fontSize: 12, fontWeight: '600', color: '#475569', marginTop: 2 },

  lotActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  actionBtnPrimary: {
    flex: 1,
    minWidth: 65,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1b4d3e',
    paddingVertical: 8,
    borderRadius: 8,
    gap: 4,
  },
  actionBtnPrimaryText: { color: '#ffffff', fontSize: 11, fontWeight: '700' },
  actionBtnEdit: {
    flex: 1,
    minWidth: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#d97706',
    paddingVertical: 8,
    borderRadius: 8,
    gap: 4,
  },
  actionBtnEditText: { color: '#ffffff', fontSize: 11, fontWeight: '700' },
  actionBtnDelete: {
    flex: 1,
    minWidth: 70,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#b91c1c',
    paddingVertical: 8,
    borderRadius: 8,
    gap: 4,
  },
  actionBtnDeleteText: { color: '#ffffff', fontSize: 11, fontWeight: '700' },
  actionBtnSecondary: {
    flex: 1,
    minWidth: 75,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e2e8f0',
    paddingVertical: 8,
    borderRadius: 8,
    gap: 4,
  },
  actionBtnSecondaryText: { color: '#475569', fontSize: 11, fontWeight: '700' },

  // Delete Confirm Modal
  confirmCard: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
  confirmIconRow: { alignItems: 'center', marginBottom: 12 },
  confirmIconBgDelete: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#fee2e2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmTitle: { fontSize: 18, fontWeight: '800', color: '#b91c1c', textAlign: 'center', marginBottom: 4 },
  confirmSubtitle: { fontSize: 13, color: '#475569', textAlign: 'center', marginBottom: 18, lineHeight: 18 },
  confirmDetails: {
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 8,
  },
  confirmRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  confirmLabel: { fontSize: 12, color: '#64748b', fontWeight: '600' },
  confirmValue: { fontSize: 14, color: '#0f172a', fontWeight: '800' },
  confirmLocation: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '700',
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
    overflow: 'hidden',
  },
  confirmDivider: { height: 1, backgroundColor: '#e2e8f0' },
  confirmActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 20 },
  btnCancel: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
  },
  btnCancelText: { color: '#475569', fontSize: 13, fontWeight: '700' },
  btnDeleteConfirm: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
    backgroundColor: '#b91c1c',
    minWidth: 90,
    alignItems: 'center',
  },
  btnConfirmText: { color: '#ffffff', fontSize: 13, fontWeight: '700' },

  // Edit Card
  editCard: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
  editModalTitle: { fontSize: 18, fontWeight: '800', color: '#1b4d3e', marginBottom: 16 },
  fieldWrapper: { marginBottom: 14 },
  fieldLabel: { fontSize: 11, fontWeight: '700', color: '#475569', marginBottom: 6, textTransform: 'uppercase' },
  lockedInput: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  lockedInputText: { color: '#64748b', fontWeight: '700', fontSize: 14 },
  textInput: {
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#0f172a',
    backgroundColor: '#f8fafc',
  },
  textArea: {
    minHeight: 60,
    textAlignVertical: 'top',
  },
  btnSaveEdit: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
    backgroundColor: '#d97706',
    minWidth: 100,
    alignItems: 'center',
  },

  // Empty rack
  emptyRackContainer: {
    alignItems: 'center',
    paddingVertical: 20,
    gap: 8,
  },
  emptyRackText: { color: '#94a3b8', fontSize: 14, fontWeight: '600' },
  addHereButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1b4d3e',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
    marginTop: 4,
  },
  addHereButtonText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  // Modal footer
  modalCloseFooterBtn: {
    backgroundColor: '#f1f5f9',
    paddingVertical: 12,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  modalCloseFooterText: { fontSize: 12, color: '#475569', fontWeight: '700' },

  // Supervisor Mgmt Modals
  mgmtModalContainer: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  mgmtModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#ffffff',
  },
  mgmtModalTitle: { fontSize: 18, fontWeight: '800', color: '#1b4d3e' },
  
  // Area Form
  addAreaForm: {
    backgroundColor: '#ffffff',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  formSectionTitle: { fontSize: 13, fontWeight: '800', color: '#475569', marginBottom: 10, textTransform: 'uppercase' },
  formRow: { flexDirection: 'column', alignItems: 'stretch', gap: 8 },
  addAreaBtn: {
    backgroundColor: '#1b4d3e',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addAreaBtnText: { color: '#ffffff', fontWeight: '700', fontSize: 13 },
  btnDisabled: { backgroundColor: '#94a3b8' },
  
  listSectionTitle: { fontSize: 12, fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  
  // Area Row
  areaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    padding: 14,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  areaRowCode: { fontSize: 15, fontWeight: '800', color: '#0f172a' },
  areaRowLabel: { fontSize: 12, color: '#64748b', marginTop: 2 },
  areaRowRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  activeStatusText: { fontSize: 12, fontWeight: '700', marginRight: 4 },

  // Profile Row
  profileRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    padding: 14,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  profileName: { fontSize: 14, fontWeight: '800', color: '#0f172a' },
  profileEmail: { fontSize: 12, color: '#64748b', marginTop: 2 },
  profileRowRight: { alignItems: 'flex-end', gap: 6 },
  profileRoleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  profileRoleText: { color: '#ffffff', fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  roleToggleBtn: {
    borderWidth: 1,
    borderColor: '#059669',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  roleToggleBtnText: { color: '#059669', fontSize: 10, fontWeight: '700' },
  
  manageAreasBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  manageAreasBtnText: {
    color: '#065f46',
    fontSize: 10,
    fontWeight: '700',
  },
  areaModalContainer: {
    flex: 1,
    backgroundColor: '#f1f5f9',
  },
  areaModalHeader: {
    backgroundColor: '#1b4d3e',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 16,
  },
  areaModalTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  areaModalCloseBtn: {
    padding: 4,
  },
  areaModalContent: {
    flex: 1,
    padding: 16,
  },
  areaFormCard: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  areaFormTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#334155',
    marginBottom: 12,
  },
  areaFormRow: {
    flexDirection: 'row',
    gap: 8,
  },
  areaFormInputCode: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    paddingHorizontal: 10,
    height: 40,
  },
  areaFormInputLabel: {
    flex: 2,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    paddingHorizontal: 10,
    height: 40,
  },
  areaFormBtn: {
    backgroundColor: '#059669',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderRadius: 6,
  },
  areaFormBtnText: {
    color: '#ffffff',
    fontWeight: 'bold',
  },
  areaListTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 12,
  },
  areaList: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  areaListItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  areaItemCode: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  areaItemLabel: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  areaItemDeleteBtn: {
    padding: 8,
  },
});
export default BoardScreen;
